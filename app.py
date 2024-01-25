from flask import Flask, request, render_template, redirect, url_for
from flask_socketio import SocketIO, join_room
from bleach import clean
from holdem import *
import secrets, uuid, json, time, threading

def run_timer(game):
    while not game.hand_over():
        time_now = time.time()
        time_elapsed = time_now - game.move_time_start
        game.move_time_remaining = game.time_per_move - time_elapsed
        cur_player = game.cur_player()
        if time_elapsed > game.time_per_move:
            game.move_time_start = time_now
            cur_player.afk += 1
            handle_player_action({'gameId': game.id, 'playerId': cur_player.id, 'sessionId': cur_player.session_id, 'action': 'afk_fold'})
        time.sleep(0.1)

app = Flask(__name__)
app.config['SECRET_KEY'] = secrets.token_hex(32)
socketio = SocketIO(app)
games = {} # implement database instead of dict

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/create_lobby')
def create_lobby():
    return render_template('create_lobby.html')

@app.route('/join/<game_id>')
def join(game_id):
    return render_template('player.html', game_id=game_id)

@app.route('/play/<game_id>')
def play(game_id):
    return render_template('game.html')

@app.route('/create_game', methods=['POST'])
def create_game():
    player_name = clean(str(request.form['player_name']))
    game = TexasHoldem(int(request.form['buy_in']), int(request.form['small_blind']), int(request.form['big_blind']))
    game_id = str(uuid.uuid4())
    games[game_id] = game
    player_id = secrets.token_hex(16)
    session_id = secrets.token_hex(16)
    player = Player(player_name, player_id, game.buy_in)
    player.session_id = session_id
    game.add_player(player)
    game.creator_id = player_id
    game.id = game_id
    response = redirect(url_for('play', game_id=game_id))
    response.set_cookie('player_id', player_id)
    response.set_cookie('session_id', session_id)
    return response

@app.route('/add_player/<game_id>', methods=['POST'])
def add_player(game_id):
    player_id = request.cookies.get('player_id')
    game = games[game_id]

    player_name = clean(str(request.form['player_name']))
    player_id = secrets.token_hex(16)
    session_id = secrets.token_hex(16)
    player = Player(player_name, player_id, game.buy_in)
    player.session_id = session_id
    player.live = not game.live
    game.add_player(player)
    response = redirect(url_for('play', game_id=game_id))
    response.set_cookie('player_id', player_id)
    response.set_cookie('session_id', session_id)
    return response

@socketio.on('join')
def on_join(data):
    game_id = clean(str(data['gameId']))
    player_id = clean(str(data['playerId']))
    session_id = clean(str(data['sessionId']))
    game = games[game_id]
    player_sessions = {p.id: p.session_id for p in game.players}

    if player_id not in player_sessions or player_sessions[player_id] != session_id:
        return {"error": "Player not in game.", "gameId": game_id}
    if player_sessions[player_id] != session_id:
        return {"error": "Invalid session for player.", "gameId": game_id}
    
    this_player = next(p for p in game.players if p.id == player_id)
    this_player.in_game = True

    join_room(game_id)
    join_room(player_id)

@socketio.on('playerAction')
def handle_player_action(data):
    action = clean(str(data['action']))
    game_id = clean(str(data['gameId']))
    player_id = clean(str(data['playerId']))
    session_id = clean(str(data['sessionId']))
    game = games[game_id]
    player_sessions = {p.id: p.session_id for p in game.players}
    cur_player = game.cur_player()

    if player_id not in player_sessions or session_id != player_sessions[player_id]:
        return
    
    this_player = next(p for p in game.players if p.id == player_id)

    def set_timer():
        game.move_time_start = time.time()
        game.move_time_remaining = game.time_per_move

        if game.timer_thread is None or not game.timer_thread.is_alive():
            game.timer_thread = threading.Thread(target=run_timer, args=(game,))
            game.timer_thread.start()
            
    if player_id == cur_player.id: 
        if action in ['check', 'bet', 'fold', 'afk_fold']:
            if action == 'check':
                game.bet()
            elif action == 'bet':
                amount = data.get('amount')
                game.bet(int(amount))
            elif action in ['fold', 'afk_fold']:
                game.fold()

            set_timer()
            cur_player.afk = 0 if action != 'afk_fold' else cur_player.afk

    this_player.afk = 0 if action == 'join' else this_player.afk
    live_players = [p.id for p in game.players if p.live]

    if action == 'new_hand' and len([p.id for p in game.players if p.balance]) > 1:
        if game.hand_over() or (game.creator_id == player_id and player_sessions[player_id] == session_id and game.round < 0):
            game.new_hand()
            game.live = True
            set_timer()
    
    if action == 'leave':
        this_player.in_game = False
        this_player.live = False

    round_over = game.round_over()
    if round_over:
        game.handle_round_over()

    hand_over = game.hand_over()

    if hand_over:
        game.distribute_pot()
        if action == 'show':
            this_player.show = True
        
        if len(live_players) > 1:
            for player in game.players:
                if game.last_better_id == player.id and player.bets[-1] > 0:
                    player.show = True
    
    if game.current_bet == 0 and len(live_players) > 1 and len([p.id for p in game.players if p.live and p.balance > 0]) < 2:
        for player in game.players:
            if player.live:
                player.show = True

    for player in game.players:
        if action in ['check', 'fold'] and player.id == player_id:       
            player.next_move = None if player.next_move == action else action
        
        if player.id == cur_player.id:
            player.next_move = None

        players_json = json.dumps([{'name': p.name, 'id': p.id, 'balance': p.balance, 'in_game': p.in_game, 'live': p.live, 'in_pot': p.bets[game.round] if game.round < len(p.bets) else 0, 'current': p == game.cur_player(), 'next_move': p.next_move if p.id == player.id else None, 'hand': p.hand if (p.show or p.id == player.id) else [None, None] if p.hand else [], 'best_hand': p.best_hand if p.id == player.id else [], 'score': p.score if (p.show or p.id == player.id) else [-1], 'profit': p.profit, 'show': p.show, 'afk': p.afk} for p in game.players])
        socketio.emit('player_list', players_json, room=player.id)

    socketio.emit('game_info', {'live': game.live, 'pot': game.pot, 'cards': game.community_cards, 'current_bet': game.current_bet, 'creator_id': game.creator_id, 'min_raise': game.min_raise, 'big_blind': game.big_blind, 'hand': game.hand, 'hand_over': hand_over, 'time_per_move': game.time_per_move, 'time_left': game.move_time_remaining}, room=game_id)

if __name__ == '__main__':
    socketio.run(app, debug=True)