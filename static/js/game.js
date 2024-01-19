function getCookie(name) {
    let cookieArr = document.cookie.split(';');

    for (let i = 0; i < cookieArr.length; i++) {
        let cookiePair = cookieArr[i].split('=');

        if (name == cookiePair[0].trim()) {
            return decodeURIComponent(cookiePair[1]);
        }
    }

    return null;
}

function parseCard(card) {
    const suiteConv = ['♣', '♥', '♠', '♦'];
    const rankConv = ['J', 'Q', 'K', 'A'];
    let suite = suiteConv[card[1]];
    let rank = card[0];

    if (rank > 10) {
        rank = rankConv[rank - 11];
    } else {
        rank = rank.toString();
    }

    return [rank, suite];
}

function makeCardFront(card) {
    const cardFront = document.createElement('div');
    const suiteContainer = document.createElement('div');
    const cardSuite = document.createElement('p');
    const cardRank = document.createElement('p');

    suiteContainer.appendChild(cardSuite);
    cardFront.appendChild(cardRank);
    cardFront.appendChild(suiteContainer);
    cardFront.setAttribute('id', card);

    card = parseCard(card);
    rank = card[0]
    suite = card[1]
    cardRank.innerHTML = rank;
    cardSuite.innerHTML = suite;

    if (['♥', '♦'].includes(suite)) {
        cardFront.className = 'card card_front card_red';
    } else {
        cardFront.className = 'card card_front';
    }

    return cardFront;
}

function makeCardBack() {
    const cardBack = document.createElement('div');
    const cardLogo = document.createElement('img');

    cardBack.setAttribute('class', 'card card_back');
    cardLogo.src = '../static/img/logo4.svg';
    cardBack.appendChild(cardLogo);
    return cardBack;
}

function makeCardFlip(card, delay) {
    const flipCard = document.createElement('div');
    const flipCardInner = document.createElement('div');
    const flipCardFront = document.createElement('div');
    const flipCardBack = document.createElement('div');

    flipCard.setAttribute('id', card);
    flipCard.setAttribute('class', 'card flip-card');
    flipCardInner.setAttribute('class', 'flip-card-inner');
    flipCardFront.setAttribute('class', 'flip-card-front');
    flipCardBack.setAttribute('class', 'flip-card-back');

    flipCard.appendChild(flipCardInner);
    flipCardInner.appendChild(flipCardFront);
    flipCardInner.appendChild(flipCardBack);
    flipCardFront.appendChild(makeCardBack());
    flipCardBack.appendChild(makeCardFront(card));

    setTimeout(function () {
        flipCard.classList.add('flip');
    }, delay);

    return flipCard;
}

function makePlayer(player) {
    const infoContainer = document.createElement('div');
    const playerInfo = document.createElement('div');
    const name = document.createElement('div');
    const hand = document.createElement('div');
    const balance = document.createElement('div');

    infoContainer.setAttribute('id', player.id);
    infoContainer.setAttribute('class', 'info_container');
    playerInfo.setAttribute('class', 'player_info');
    name.setAttribute('class', 'player_name');
    hand.setAttribute('class', 'player_hand');
    balance.setAttribute('class', 'player_balance value_container');

    playerInfo.appendChild(name);
    playerInfo.appendChild(hand);
    playerInfo.appendChild(balance);
    infoContainer.appendChild(playerInfo);

    name.innerHTML = player.name;
    balance.innerHTML = `$${player.balance}`;

    return infoContainer;
}

const socket = io();
const gameId = window.location.pathname.split('/').pop();
const playerId = getCookie('player_id');
const sessionId = getCookie('session_id');
const scoreRanking = ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'];

let players = null;

socket.on('connect', () => {
    socket.emit('join', { gameId: gameId, playerId: playerId, sessionId: sessionId }, (response) => {
        if (!response) {
            socket.emit('playerAction', { gameId: gameId, playerId: playerId, sessionId: sessionId, action: 'none' });
        } else {
            window.location.href = '/join/' + response.gameId;
        }
    });
});

socket.on('player_list', playerData => {
    players = JSON.parse(playerData);
});

socket.on('game_info', game => {
    const playerList = document.getElementById('player_list');
    const pot = document.getElementById('game_pot');
    const choiceContainer = document.getElementById('choice_container');
    const comCards = document.getElementById('com_cards');
    const bestHand = document.getElementById('best_hand');
    const thisPlayer = players.find(player => player.id == playerId);
    const thisPlayerIndex = players.findIndex(player => player.id == playerId);
    const totalPlayers = players.length;
    const midPoint = Math.floor(totalPlayers / 2);
    const turnPlayer = players.find(player => player.current);
    const autoCheck = !game.hand_over && (turnPlayer.balance == 0 || (game.current_bet == 0 & players.filter(p => p.live && p.balance > 0).length < 2))

    choiceContainer.innerHTML = '';
    bestHand.innerHTML = '';
    pot.innerHTML = `Pot: $${game.pot}`;

    players.forEach((player, index) => {
        let infoContainer = document.getElementById(player.id);

        if (infoContainer == null) {
            infoContainer = makePlayer(player, player.id == playerId);
            playerList.appendChild(infoContainer);
        }
        
        let indDiff = index - thisPlayerIndex;
        let offset = Math.abs(indDiff) > midPoint ? ((index > midPoint) ? index - players.length : index + 1) : indDiff;
        infoContainer.style.gridColumn = `${4 + offset}`;
        infoContainer.style.gridRow = 1;

        const playerInfo = infoContainer.querySelector('.player_info');

        if (game.live) {
            const hand = playerInfo.querySelector('.player_hand');
            const cardsInHand = hand.children;
            const balance = playerInfo.querySelector('.player_balance');
            let playerScore = infoContainer.querySelector('.score');
            let netChange = infoContainer.querySelector('#net_change');
            let delay = 0;
            let cardIds = [];

            balance.innerHTML = `$${player.balance}`;

            for (let i = 0; i < cardsInHand.length; i++) {
                cardIds.push(cardsInHand[i].id);
            }

            if (`${cardIds}` != `${player.hand}`) {
                hand.innerHTML = '';
                player.hand.forEach(card => {
                    if (card == null) {
                        hand.appendChild(makeCardBack());
                    } else {
                        delay += 300;
                        hand.appendChild(makeCardFlip(card, delay));
                    }
                });
            }

            // if (player.current & !game.hand_over & !autoCheck) {
            //     hand.style.backgroundColor = 'rgb(255,0,0,0.3)';
            //     hand.style.boxShadow = '0px 0px 40px 30px rgb(255,0,0,0.3)';
            // } else if (player.profit > 0) {
            //     hand.style.backgroundColor = 'rgb(0,0,255,0.3)';
            //     hand.style.boxShadow = '0px 0px 40px 30px rgb(0,0,255,0.3)';
            // } else {
            //     hand.style.backgroundColor = 'rgb(0,0,0,0)';
            //     hand.style.boxShadow = 'none';
            // }

            if (netChange == null) {
                if ((player.in_pot > 0 & !game.hand_over) || player.profit > 0) {
                    netChange = document.createElement('div');
                    netChange.setAttribute('class', 'value_container');
                    netChange.setAttribute('id', 'net_change');
                    infoContainer.appendChild(netChange);

                }
            } else if (!(player.in_pot > 0 & !game.hand_over || player.profit > 0)) {
                infoContainer.removeChild(netChange);
            }

            if (player.in_pot > 0) {
                netChange.innerHTML = `-$${player.in_pot}`;
                netChange.style.backgroundColor = 'rgb(255, 0, 0, 0.5)';
            }

            if (player.profit > 0) {
                netChange.innerHTML = `+$${player.profit}`;
                netChange.style.backgroundColor = 'rgb(0, 100, 0, 0.5)';
            }

            if (game.hand_over & player.id != playerId & player.score[0] > -1 & playerScore == null) {
                const score = document.createElement('div');
                score.setAttribute('class', 'score');
                score.innerHTML = `${scoreRanking[player.score[0]]}`;
                infoContainer.appendChild(score);
            }

            if (!game.hand_over & playerScore != null) {
                infoContainer.removeChild(playerScore);
            }

            if (!player.live) {
                playerInfo.style.opacity = '0.2';
                if (player.id == playerId) {
                    choiceContainer.style.opacity = '0.2';
                }
            } else {
                playerInfo.style.opacity = '1';
                if (player.id == playerId) {
                    choiceContainer.style.opacity = '1';
                }
            }
        }
    });

    if (!game.live) {
        if (playerId == game.creator_id) {
            if (choiceContainer.childElementCount > 0) {
                return;
            }
            const startButton = document.createElement('button');
            startButton.setAttribute('id', 'start_game_button');
            startButton.setAttribute('class', 'common_button');
            startButton.innerHTML = 'Start Game';
            choiceContainer.appendChild(startButton);
            startButton.addEventListener('click', () => {
                socket.emit('handStart', { gameId: gameId, playerId: playerId, sessionId: sessionId });
                socket.emit('playerAction', { gameId: gameId, playerId: playerId, sessionId: sessionId, action: 'none' });
            });
        }
        return;
    }

    if (choiceContainer.children.length == 0) {
        const mainChoices = document.createElement('div');
        mainChoices.setAttribute('id', 'main_choices');
        choiceContainer.appendChild(mainChoices);
    }

    let delay = 0;
    game.cards.forEach(card => {
        if (!document.getElementById(card)) {
            delay += 300;
            comCards.appendChild(makeCardFlip(card, delay));
        }
    });

    const mainChoices = choiceContainer.querySelector('#main_choices');

    const callAmount = game.current_bet - thisPlayer.in_pot;
    const minRaise = game.min_raise + (game.current_bet - thisPlayer.in_pot);
    let raiseAmount = minRaise;

    const callButton = document.createElement('button');
    const foldButton = document.createElement('button');
    const raiseButton = document.createElement('button');
    const raiseSlider = document.createElement('input');
    const bestHandScore = document.createElement('div');
    const bestHandCards = document.createElement('div');

    callButton.setAttribute('class', 'common_button blue_button');
    callButton.setAttribute('id', 'call_button');
    foldButton.setAttribute('class', 'common_button red_button');
    foldButton.setAttribute('id', 'fold_button');
    raiseButton.setAttribute('class', 'common_button green_button');
    raiseSlider.setAttribute('type', 'range');
    raiseSlider.setAttribute('min', minRaise);
    raiseSlider.setAttribute('max', thisPlayer.balance);
    raiseSlider.setAttribute('value', minRaise);
    raiseSlider.setAttribute('id', 'raise_slider');
    bestHandScore.setAttribute('id', 'best_hand_score');
    bestHandScore.setAttribute('class', 'score');
    bestHandCards.setAttribute('id', 'best_hand_cards');

    mainChoices.appendChild(callButton);
    mainChoices.appendChild(foldButton);

    if (thisPlayer.next_move != null) {
        if (thisPlayer.next_move == 'check') {
            callButton.classList.add('active');
            foldButton.classList.remove('active');
        } else {
            foldButton.classList.add('active');
            callButton.classList.remove('active');
        }
    } else {
        callButton.classList.remove('active');
        foldButton.classList.remove('active');
    }

    if (autoCheck) {
        choiceContainer.innerHTML = '';
        if (playerId == turnPlayer.id) {
            const checkDelay = 700;
            setTimeout(() => {
                socket.emit('playerAction', { gameId: gameId, playerId: playerId, sessionId: sessionId, action: 'check' });
            }, checkDelay);
        }
    } else if (!game.hand_over & playerId == turnPlayer.id & turnPlayer.next_move != null) {
        if (turnPlayer.next_move == 'check') {
            socket.emit('playerAction', { gameId: gameId, playerId: playerId, sessionId: sessionId, action: 'check' });
        } else if (turnPlayer.next_move == 'fold') {
            socket.emit('playerAction', { gameId: gameId, playerId: playerId, sessionId: sessionId, action: 'fold' });
        }
    } else if (!game.hand_over) {
        let raiseAction = 'Raise';
        foldButton.innerHTML = 'Fold';

        if (callAmount == 0) {
            callButton.innerHTML = 'Check';
            raiseAction = 'Bet';
        } else {
            callButton.innerHTML = `$${callAmount} Call`;
        }

        callButton.addEventListener("click", () => {
            socket.emit('playerAction', { gameId: gameId, playerId: playerId, sessionId: sessionId, action: 'check' });
        });

        foldButton.addEventListener("click", () => {
            socket.emit('playerAction', { gameId: gameId, playerId: playerId, sessionId: sessionId, action: 'fold' });
        });

        if (playerId == turnPlayer.id) {
            const raiseContainer = document.createElement('div');
            raiseContainer.setAttribute('id', 'raise_container');
            if (thisPlayer.balance > minRaise) {
                raiseButton.innerHTML = `$${minRaise} ${raiseAction}`;
                raiseSlider.oninput = () => {
                    raiseAmount = raiseSlider.value;
                    raiseButton.innerHTML = `$${raiseAmount} ${raiseAction}`;
                }
                raiseContainer.appendChild(raiseSlider);
                raiseContainer.appendChild(raiseButton);
            } else if (thisPlayer.balance > 0) {
                raiseButton.innerHTML = `$${thisPlayer.balance} All-in`;
                raiseContainer.appendChild(raiseButton);
            }

            raiseButton.addEventListener("click", () => {
                socket.emit('playerAction', { gameId: gameId, playerId: playerId, sessionId: sessionId, action: 'bet', amount: raiseAmount });
            });

            choiceContainer.appendChild(raiseContainer);
        }

    } else {
        const newGameDelay = 8000;
        mainChoices.removeChild(foldButton);

        if (!thisPlayer.show & thisPlayer.live) {
            callButton.innerHTML = 'Show';

            callButton.addEventListener("click", () => {
                socket.emit('playerAction', { gameId: gameId, playerId: playerId, sessionId: sessionId, action: 'show' });
            });

        } else {
            choiceContainer.innerHTML = '';
        }

        setTimeout(() => {
            comCards.innerHTML = "";

            socket.emit('handStart', { gameId: gameId, playerId: playerId, sessionId: sessionId });
            socket.emit('playerAction', { gameId: gameId, playerId: playerId, sessionId: sessionId, action: 'none' });

        }, newGameDelay);
    }

    bestHandScore.innerHTML = `${scoreRanking[thisPlayer.score[0]]}`;
    for (let i = 0; i < thisPlayer.best_hand.length; i++) {
        bestHandCards.appendChild(makeCardFront(thisPlayer.best_hand[i]));
    }
    bestHand.appendChild(bestHandScore);
    bestHand.appendChild(bestHandCards);
});

