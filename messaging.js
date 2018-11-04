var amqp = require('amqplib/callback_api');
var nodeId = null;
var amqpConn;
var nodeType = null;
var amqpCh;

const EX_NODE_JOINED = "node_joined";
const EX_PING = "ping";
const EX_HEARTBEAT = "heartbeat";
const EX_VOTER_QUEUED = "voter_queued";
const EX_VOTER_SERVED = "voter_served";
const EX_VOTE_CASTED = "vote_casted";

const NODE_TYPE_REGDESK = "regdesk";
const NODE_TYPE_VOTING_BOOTH = "voting_booth";

exports.EX_NODE_JOINED = EX_NODE_JOINED;
exports.EX_PING = EX_PING;
exports.EX_HEARTBEAT = EX_HEARTBEAT;
exports.EX_VOTER_QUEUED = EX_VOTER_QUEUED;
exports.EX_VOTER_SERVED = EX_VOTER_SERVED;
exports.EX_VOTE_CASTED = EX_VOTE_CASTED;

exports.NODE_TYPE_REGDESK = NODE_TYPE_REGDESK;
exports.NODE_TYPE_VOTING_BOOTH = NODE_TYPE_VOTING_BOOTH;

var listeners = [];

exports.init = function(nid, ntype) {
    nodeId = nid;
    nodeType = ntype;
};

exports.connect = function(url, callback) {
    if(nodeId != null) {
        amqp.connect(url, function (err, conn) {
            conn.createChannel(function (err, ch) {
                assertExchanges(ch);
                if(callback != null) callback();
            });

            amqpConn = conn;
        });
    } else {
        throw "Node is not initialized";
    }
};

exports.close = function() {
    if(amqpConn !== undefined)
        amqpConn.close();
};

function assertExchanges(ch) {
    amqpCh = ch;

    // Assert exchanges
    ch.assertExchange(EX_NODE_JOINED, 'topic', {durable: false});
    ch.assertExchange(EX_PING, 'topic', {durable: false});
    ch.assertExchange(EX_HEARTBEAT, 'topic', {durable: false});

    ch.assertExchange(EX_VOTER_QUEUED, 'topic', {durable: true});
    ch.assertExchange(EX_VOTE_CASTED, 'topic', {durable: true});

    // Assert queues
    ch.assertQueue(buildQueueName(EX_NODE_JOINED), {durable: false, exclusive: true}, function(err, q) {
        ch.bindQueue(q.queue, EX_NODE_JOINED, '');

        ch.consume(q.queue, function(msg) {
            console.log(" [x] %s", msg.content.toString());
            let callback = listeners[EX_NODE_JOINED];
            if(callback !== undefined)
                callback(msg, ch);
        }, {noAck: true});

        ch.sendToQueue(q.queue, new Buffer(JSON.stringify({'nodeId': nodeId, 'nodeType': nodeType})));
    });

    ch.assertQueue(buildQueueName(EX_PING), {durable: false, exclusive: true}, function(err, q) {
        ch.bindQueue(q.queue, EX_PING, '');

        ch.consume(q.queue, function(msg) {
            console.log(" [x] %s", msg.content.toString());
            let callback = listeners[EX_PING];
            if(callback !== undefined)
                callback(msg, ch);

            ch.sendToQueue(buildQueueName(EX_HEARTBEAT), new Buffer({'nodeId': nodeId, 'nodeType': nodeType}));
        }, {noAck: true});
    });

    ch.assertQueue(buildQueueName(EX_HEARTBEAT), {durable: false, exclusive: true}, function(err, q) {
        ch.bindQueue(q.queue, EX_HEARTBEAT, '');

        ch.consume(q.queue, function(msg) {
            console.log(" [x] %s", msg.content.toString());
            let callback = listeners[EX_HEARTBEAT];
            if(callback !== undefined)
                callback(msg, ch);
        }, {noAck: true});    });

    ch.assertQueue(EX_VOTER_QUEUED, {durable: true, exclusive: false}, function(err, q) {
        ch.bindQueue(q.queue, EX_VOTER_QUEUED, '');

        // No auto acknowledge, since voting can take a long time (machine wise)
        /*ch.consume(q.queue, function(msg) {
            console.log(" [x] %s", msg.content.toString());
            let callback = listeners[EX_VOTER_QUEUED];
            if(callback !== undefined)
                callback(msg, ch);
        }, {noAck: false});*/
    });

    ch.assertQueue(buildQueueName(EX_VOTE_CASTED), {durable: true, exclusive: true}, function(err, q) {
        ch.bindQueue(q.queue, EX_VOTE_CASTED, '');

        // No auto acknowledge, since delivery is important
        ch.consume(q.queue, function(msg) {
            console.log(" [x] %s", msg.content.toString());
            let callback = listeners[EX_VOTE_CASTED];
            if(callback !== undefined)
                callback(msg, ch);
        }, {noAck: false});
    });

    ch.assertQueue(buildQueueName(EX_VOTER_SERVED), {durable: true, exclusive: true}, function(err, q) {
        // No auto acknowledge, since delivery is important
        ch.consume(q.queue, function(msg) {
            console.log(" [x] %s", msg.content.toString());
            let callback = listeners[EX_VOTER_SERVED];
            if(callback !== undefined)
                callback(msg, ch);
        }, {noAck: false});
    });

}

function buildQueueName(exName) {
    return exName + ":" + nodeId;
}

exports.setMessageListener = function(queue, callback) {
    listeners[queue] = callback;
};


exports.publish = function(queue, msg) {
    let queueName = (queue === EX_VOTER_QUEUED) ? EX_VOTER_QUEUED.toString() : buildQueueName(queue.toString());
    if(amqpCh !== undefined) {
        amqpCh.sendToQueue(queueName, new Buffer(msg));
        console.log(" [x] Sent to queue %s", queueName);
    }
};