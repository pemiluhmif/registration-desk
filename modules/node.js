/**
 * Pemilu HMIF
 * Node management module
 */

const dgram = require('dgram');
const server = dgram.createSocket('udp4');

const PING_PORT = 1011; // Port exposed to receive ping request
const PONG_PORT = 1012; // Port to send pong response

const NodeStatus = {
    INACTIVE: 0,
    FOLLOWER: 1,
    LEADER: 2
};

socket.on('message', function(msg, rinfo) {
    console.log('Received %d bytes from %s:%d\n', msg.length, rinfo.address, rinfo.port);
});

/**
 * Expose peer discovery interface
 * @param args arguments to respond with:
 *      - nodeId
 *      - votingSeason
 *      - dptHash
 */
exports.exposePeerDiscoveryInterface = function(args) {
    if(server.address().port !== PING_PORT) {
        server.bind(PING_PORT);
    }
};