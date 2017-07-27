/**
 * --------------------------
 * Global UI elements
 * --------------------------
 */

const vidLocal = document.getElementById('vidLocal');
const vidRemote = document.getElementById('vidRemote');
const displayChat = document.getElementById('displayChat');
const enterChat = document.getElementById('enterChat');
const btnStart = document.getElementById('btnStart');

const logErrors = err => {console.error(err)};

const ui = {
	appendChatMessage: (name, text) => {
		let time = new Date().toString('H:i:s');
		displayChat.innerHTML = `<p><strong>${name}</strong>&nbsp;<small>${time}</small><br>${text}</p>` + displayChat.innerHTML;
	},
	enableChat: () => {
		enterChat.disabled = false;
		enterChat.onkeyup = e => {
			// if enter is pressed
			if (e.keyCode === 13) {
				dataChannel.send(enterChat.value);
				ui.appendChatMessage('Du', enterChat.value);
				enterChat.value = '';
			}
		}
	}
};

/**
 * --------------------------
 * Local Video
 * --------------------------
 */
let localStream;
let remoteStream;

/**
 * --------------------------
 * Signaling
 * --------------------------
 */

const socket = io.connect('http://localhost:8888');

let connection;
let dataChannel;

// Send a message to the signaling server
const sendMessage = message => {
	message = Object.assign({to: 'default'}, message);
	console.log(`>>> SENT: ${message.type}`, message);
	socket.emit('message', message);
};

// Receive a message from the signaling server
const receiveMessage = (message) => {
	// Ignore messages that were sent by this client
	if (message.from === socket.id) {
		return;
	}
	console.log(`<<< RECEIVED: ${message.type} from ${message.from}:`, message);
	receiveSignalingMessage(message);
};
socket.on('message', receiveMessage);

const receiveSignalingMessage = (message) => {
	switch (message.type) {
		case 'init':
			ui.appendChatMessage('SYSTEM', `Peer joined.`);
			createConnection();
			startConnection(false);
			break;
		case 'offer':
			connection
				.setRemoteDescription(new RTCSessionDescription(message.descr))
				.then(() => connection.createAnswer())
				.then(answer => connection.setLocalDescription(new RTCSessionDescription(answer)))
				.then(() => sendMessage({type: 'answer', descr: connection.localDescription}))
				.catch(logErrors);
			break;
		case 'answer':
			connection.setRemoteDescription(new RTCSessionDescription(message.descr));
			break;
		case 'candidate':
			connection.addIceCandidate(new RTCIceCandidate({
				candidate: message.candidate
			}));
			break;
		default:
			logErrors(`Unknown message type: "${message.type}"`);
			break;
	}
};


/**
 * --------------------------
 * WebRTC
 * --------------------------
 */

const createConnection = () => {
	connection = new RTCPeerConnection();
	connection.addStream(localStream);
};

const startConnection = (isCreator) => {
	console.log('Starting RTC connection as ' + (isCreator ? 'creator' : 'client'));

	connection.onicecandidate = e => {
		if (e.candidate) {
			sendMessage({
				type: 'candidate',
				candidate: e.candidate.candidate
			});
		}
	};

	connection.onaddstream = e => {
		vidRemote.srcObject = e.stream;
		remoteStream = e.stream;
	};

	if (isCreator) {
		dataChannel = connection.createDataChannel('chat');
		onDataChannelCreated(dataChannel);

		connection
			.createOffer()
			.then(offer => connection.setLocalDescription(new RTCSessionDescription(offer)))
			.then(() => sendMessage({type: 'offer', descr: connection.localDescription}))
			.catch(logErrors);

	} else {
		connection.ondatachannel = event => {
			dataChannel = event.channel;
			onDataChannelCreated(dataChannel);
		};
	}
};

function onDataChannelCreated(channel) {
	channel.onopen = () => {
		ui.enableChat();
	};
	channel.onmessage = message => {
		ui.appendChatMessage('Peer', message.data);
	}
}

/**
 * --------------------------
 * Button Handlers
 * --------------------------
 */
btnStart.onclick = e => {
	navigator.mediaDevices
		.getUserMedia({
			audio: true,
			video: true
		})
		.then(stream => {
			vidLocal.srcObject = stream;
			localStream = stream;

			// Join a default room
			socket.emit('join', 'default', (message, {clients}) => {
				// If clients.length is 0, we just created the room and need to wait for a peer
				let clientNames = Object.keys(clients);
				if (clientNames.length === 0) {
					console.log('First in room, waiting for peers.');
					ui.appendChatMessage('SYSTEM', 'Created room "default". Waiting for users.');
				} else {
					sendMessage({
						type: 'init'
					});
					createConnection();
					startConnection(true);
					ui.appendChatMessage('SYSTEM', 'Joined room "default".');
				}
			});
		})
		.catch(logErrors);

	btnStart.disabled = true;
};
