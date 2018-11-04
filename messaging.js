var amqp = require('amqplib/callback_api');
var nodeId = null;
var amqpConn;

const EX_NODE_JOINED = "node_joined";
const EX_PING = "ping";
const EX_HEARTBEAT = "heartbeat";
const EX_VOTER_QUEUED = "voter_queued";
const EX_VOTER_SERVED = "voter_served";
const EX_VOTE_CASTED = "vote_casted";

var listeners = [];

exports.init = function(nid) {
    nodeId = nid;
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
    });

    ch.assertQueue(buildQueueName(EX_PING), {durable: false, exclusive: true}, function(err, q) {
        ch.bindQueue(q.queue, EX_PING, '');

        ch.consume(q.queue, function(msg) {
            console.log(" [x] %s", msg.content.toString());
            let callback = listeners[EX_PING];
            if(callback !== undefined)
                callback(msg, ch);
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
        ch.consume(q.queue, function(msg) {
            console.log(" [x] %s", msg.content.toString());
            let callback = listeners[EX_VOTER_QUEUED];
            if(callback !== undefined)
                callback(msg, ch);
        }, {noAck: false});
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
