const dgram = require('dgram');
const crypto = require('crypto');
const bencode = require('bencode');
const fs = require('fs');
const NODES = [
    { address: 'router.bittorrent.com', port: 6881 },
    { address: 'dht.transmissionbt.com', port: 6881 }
]
var count = {
    total: 10000
}
var randomID = function() {
    return crypto.createHash('sha1').update(crypto.randomBytes(20)).digest();
};

var getNeighborID = function(target, id) {
    return Buffer.concat([target.slice(0, 10), id.slice(10)]);
}
var TorrentSpider = function(options) {
    this.id = randomID();
    this.address = options.address;
    this.port = options.port;
    this.routeTable = [];
    this.udp = dgram.createSocket('udp4');
    this.page = 1;
    this.position = 0;
}
TorrentSpider.prototype.sendMsg = function(msg, rinfo) {
    var data = bencode.encode(msg);
    this.udp.send(data, 0, data.length, rinfo.port, rinfo.address);
}
TorrentSpider.prototype.initNode = function() {
    var data = {
        "t": randomID().slice(0, 4),
        "y": "q",
        "q": "find_node",
        "a": {
            "id": this.id,
            "target": randomID()
        }
    }
    //console.log(msg)
    NODES.forEach(function(el) {
        this.sendMsg(data, el)
    }.bind(this))
    this.findNodes();

}
TorrentSpider.prototype.findNodes = function() {
    var data = {
        "t": randomID().slice(0, 4),
        "y": "q",
        "q": "find_node",
        "a": {
            "id": this.id,
            "target": randomID()
        }
    }
    this.routeTable.forEach(function(el) {
        this.sendMsg(data, el);
    }.bind(this))
    this.routeTable = [];
    setTimeout(this.findNodes.bind(this), 1000);
}
TorrentSpider.prototype.getNodes = function(nodesList) {
    for (var i = 0; i + 26 <= nodesList.length; i += 26) {
        var node = {
            id: nodesList.slice(i, i + 20),
            address: nodesList[i + 20] + '.' + nodesList[i + 21] + '.' + nodesList[i + 22] + '.' + nodesList[i + 23],
            port: nodesList.readUInt16BE(i + 24)
        };
        if (node.address != this.address && node.id != this.id && node.port < 65536 && node.port > 0) {
            this.routeTable.push(node);
        }
    }
    //this.findNodes();
    //console.log(this.routeTable)
}
TorrentSpider.prototype.getPeers = function(msg, rinfo) {
    try {
        // statements
        var infohash = msg.a.info_hash;
        var t = msg.t;
        var id = msg.a.id;
        if (t === undefined || infohash.length != 20 || id.length != 20) {
            return;
        }
        var data = {
            "t": msg.t,
            "y": "r",
            "r": {
                "id": getNeighborID(infohash, this.id),
                "token": infohash.slice(0, 4),
                "nodes": ""
            }
        }
        this.sendMsg(data, rinfo)
        //console.log(`magnet:?xt=urn:btih:${infohash.toString("hex")}`)
    } catch (e) {
        // statements
        console.log(e);
    }
}
TorrentSpider.prototype.getAnnouncePeer = function(msg, rinfo) {
    try {
        // statements
        var infohash = msg.a.info_hash;
        var id = msg.a.id

        if (infohash.slice(0, 4).toString('hex') == msg.a.token.toString('hex')) {

            var data = {
                "t": msg.t,
                "y": "r",
                "r": {
                    "id": getNeighborID(id, this.id),
                }
            }
            this.sendMsg(data, rinfo);
            this.saveMagnet(infohash);
            console.log(msg.a.id.toString("hex"))
            console.log(infohash.toString("hex"))
        }
    } catch (e) {
        // statements
        console.log(e);
    }
}
TorrentSpider.prototype.saveMagnet = function(infohash) {
    var magnet = infohash.toString("hex");
    console.log(magnet);
    var that = this;
    fs.appendFile(`./infohash/${that.page}.txt`, magnet, function(err) {
        if (err) {
            return console.error(err);
        }
    });
    that.position += 1;
    if (that.position >= count.total) {
        that.position = 0;
        that.page += 1;
    }
}
TorrentSpider.prototype.start = function() {
    this.udp.bind(this.port, this.address);

    this.udp.on('listening', function() {
        console.log(`TorrentSpider listening on ${this.address}:${this.port}`);
    }.bind(this));

    this.udp.on('message', function(msg, rinfo) {
        try {
            var msg = bencode.decode(msg);
            //console.log(msg)
            if (msg.y == 'r' && msg.r.nodes) {
                //console.log('find_node')
                this.getNodes(msg.r.nodes);
            } else if (msg.y == 'q' && msg.q == 'get_peers') {
                //console.log('get_peers')
                this.getPeers(msg, rinfo);
            } else if (msg.y == 'q' && msg.q == 'announce_peer') {
                console.log('announce_peer')
                this.getAnnouncePeer(msg, rinfo);
            }
        } catch (err) {}
    }.bind(this));

    this.udp.on('error', function() {

    }.bind(this));

    this.initNode();
    this.initProgress();
    this.onexit();
};
TorrentSpider.prototype.initProgress = function() {
    var that = this;
    fs.readFile('./progress/progress_ts.txt', function(err, data) {
        if (err) {
            return console.error(err);
        }
        try {
            var page = data.toString().split('/')[0] * 1;
            var position = data.toString().split('/')[1] * 1;
            that.page = page;
            that.position = position;
        } catch (e) {
            return console.log(e);
        }
    });
};
TorrentSpider.prototype.onexit = function() {
    var that = this;
    process.on('SIGINT', function() {
        fs.writeFile('./progress/progress_ts.txt', that.page + '/' + that.position, function() {
            process.exit(0)
        })

    });
};

var spider1 = new TorrentSpider({ address: '0.0.0.0', port: 6881 });
spider1.start();