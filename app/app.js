/**
 * --------------------------
 * Global UI elements
 * --------------------------
 */

const vidLocal = document.getElementById('vidLocal');
const vidRemote = document.getElementById('vidRemote');
const displayChat = document.getElementById('displayChat');
const enterChat = document.getElementById('enterChat');

const logErrors = err => {console.error(err)};

const ui = {
	appendChatMessage: (name, text) => {
		let time = new Date().toString('H:i:s');
		displayChat.innerHTML = `<p><strong>${name}</strong>&nbsp;<small>${time}</small><br>${text}</p>` + displayChat.innerHTML;
	},
	enableChat: () => {
		enterChat.disabled = false;
		enterChat.onkeyup = (keyevent) => {
			// if enter is pressed
			if (keyevent.keyCode === 13) {
				dataChannel.send(enterChat.value);
				ui.appendChatMessage('Du', enterChat.value);
				enterChat.value = '';
			}
		}
	}
};

/**
 * --------------------------
 * Signaling
 * --------------------------
 */
const socket = io.connect('http://localhost:8888');

// Send a message to the signaling server
const sendMessage = (message) => {
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
		createConnection(true);
		ui.appendChatMessage('SYSTEM', 'Joined room "default".');
	}
});

/**
 * --------------------------
 * Local Video
 * --------------------------
 */
let localStream;

navigator.mediaDevices.getUserMedia({
	audio: true,
	video: true
})
	.then(stream => {
		vidLocal.src = window.URL.createObjectURL(stream);
		localStream = stream;
	})
	.catch(logErrors);

/**
 * --------------------------
 * WebRTC
 * --------------------------
 */
let connection;
let dataChannel;

const receiveSignalingMessage = (message) => {
	switch (message.type) {
		case 'init':
			ui.appendChatMessage('SYSTEM', `Peer joined.`);
			createConnection(false);
			break;
		case 'offer':
			connection.setRemoteDescription(new RTCSessionDescription(message.descr), () => {}, logErrors);
			connection.createAnswer(onOfferReceived, logErrors);
			break;
		case 'answer':
			connection.setRemoteDescription(new RTCSessionDescription(message.descr), () => {}, logErrors);
			break;
		case 'candidate':
			connection.addIceCandidate(new RTCIceCandidate({
				candidate: message.candidate
			}));
			break;
		case 'remove':
			console.log('Connection terminated.');
			connection.close();
			break;
		default:
			logErrors(`Unknown message type: "${message.type}"`);
			break;
	}
};

const createConnection = (isCreator) => {
	console.log('Creating RTC connection as ' + (isCreator ? 'creator' : 'client'));
	connection = new RTCPeerConnection();

	//	 send any ice candidates to the other peer
	connection.onicecandidate = function (event) {
		if (event.candidate) {
			sendMessage({
				type: 'candidate',
				label: event.candidate.sdpMLineIndex,
				id: event.candidate.sdpMid,
				candidate: event.candidate.candidate
			});
		} else {
			console.log('End of candidates.');
		}
	};

	if (isCreator) {
		dataChannel = connection.createDataChannel('chat');
		onDataChannelCreated(dataChannel);

		connection.createOffer(onLocalSessionCreated, logErrors);
	} else {
		connection.ondatachannel = function (event) {
			dataChannel = event.channel;
			onDataChannelCreated(dataChannel);
		};
	}
};

function onLocalSessionCreated(desc) {
	connection.setLocalDescription(desc, function () {
		sendMessage({type: 'offer', descr: connection.localDescription});
	}, logErrors);
}

function onOfferReceived(desc) {
	connection.setLocalDescription(desc, function () {
		sendMessage({type: 'answer', descr: connection.localDescription});
	}, logErrors);
}

function onDataChannelCreated(channel) {
	channel.onopen = function () {
		ui.enableChat();
	};

	channel.onmessage = (message) => {
		ui.appendChatMessage('Peer', message.data);
	}
}
