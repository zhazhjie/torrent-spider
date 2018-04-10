const dgram = require('dgram');
const server = dgram.createSocket('udp4');
const bencode = require('bencode');
const http = require('http');
const fs = require('fs');
const MongoClient = require('mongodb').MongoClient;

// Connection URL
const url = 'mongodb://localhost:27017/torrent';

// Use connect method to connect to the server
MongoClient.connect(url, function(err, db) {
    if(err){
        console.log(err);
    }
    console.log("Connected successfully to server");
    findDocuments(db, function() {
        //db.close();
    })

});

var findDocuments = function(db, callback) {
    // Get the documents collection
    var collection = db.collection('documents');
    // Find some documents
    collection.ensureIndex({ "id": 1 })
    var coll=collection.find({}).toArray(function(err, docs) {
        console.log(docs)
        callback(docs);
    });
}

var headers = {
    'accept-charset': 'ISO-8859-1,utf-8;q=0.7,*;q=0.3',
    'accept-language': 'en-US,en;q=0.8',
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_6_8) AppleWebKit/537.13+ (KHTML, like Gecko) Version/5.1.7 Safari/534.57.2',
    'accept-encoding': 'gzip,deflate'
};
var options = {
    hostname: 'magnet.vuze.com',
    path: '/magnetLookup?hash=ANRBNFHQ5CZM5BZBNSM4WXFDV4RQFHRX',
    port: 80,
    method: 'GET',
    headers: headers
};
var count = {
    total: 10000
}
var Download = function() {
    this.size = 40;
    this.page = 1;
    this.position = 0;
    this.db = null
};
Download.prototype.connectdb = function() {
    var that = this;
    MongoClient.connect(url, function(err, db) {
        console.log("Connected successfully to server");
        that.db = db;
    });
}

Download.prototype.insertDocuments = function(infohash, data, path) {
    // Get the documents collection
    var collection = this.db.collection('documents');
    var file = bencode.decode(data);
    var info = {
        infohash: infohash,
        name: file.info.name.toString(),
        type: 1,
        size: 0,
        fileNum: 0,
        files: [],
        hot: 0,
        createDate: 0,
        updateDate: 0,
        path: 'http://0.0.0.0' + path
    }
    if (file.info.files) {
        file.info.files.forEach(function(el) {
            info.size += el.length;
            //console.log(el.path.toString());
            var cfile = {
                name: el.path.toString(),
                size: el.length,
                type: checkType(el.path)
            };
            info.files.push(cfile);
        })
        info.fileNum = file.info.files.length;
    } else {
        info.size = file.info.length;
        info.fileNum = 1;
    }
    info.type = checkType(file.info.name)
    info.createDate = info.updateDate = new Date().getTime();
    collection.insert(info, function(err, result) {
        console.log(result);

    });
}
Download.prototype.openFile = function() {
    var that = this;
    fs.open(`./infohash/${that.page}.txt`, 'r+', function(err, fd) {
        if (err) {
            that.page += 1;
            if (that.page > count.total) {
                that.db.close();
                process.exit(0);
                return;
            }
            //console.log(that.page)
            that.openFile();
            return;
        }
        that.readFile(fd);
    });
};

Download.prototype.readFile = function(fd) {
    var that = this;
    var buf = Buffer.alloc(40);
    fs.read(fd, buf, 0, buf.length, that.position, function(err, bytes) {
        if (err) {
            console.log(err);
        }

        that.position += that.size;
        if (bytes > 0) {
            var infohash = buf.toString();
            options.path = '/magnetLookup?hash=' + infohash;
            console.log(infohash);
            that.getTorrent(infohash, fd);
        } else {
            fs.close(fd, function() {
                fs.unlink(`./infohash/${that.page}.txt`, function() {
                    that.page += 1;
                    that.openFile();
                })
            });

        }
    });
};

Download.prototype.getTorrent = function(infohash, fd) {
    var that = this;
    var time = setTimeout(function() {
        that.position += that.size;
        that.readFile(fd);
    }, 5 * 1000)
    //console.log('read')
    http.request(options, (res) => {
        const { statusCode } = res;
        console.log(statusCode)
        let error;
        if (statusCode !== 200) {
            error = new Error(`请求失败。状态码: ${statusCode}`);
        }
        if (error) {
            console.error(error.message);
            // 消耗响应数据以释放内存
            res.resume();
            return;
        }

        let rawData = [];
        res.on('data', (chunk) => {
            rawData.push(chunk);
        });

        res.on('end', () => {
            try {
                clearTimeout(time);

                rawData = Buffer.concat(rawData);

                that.saveFile(infohash, rawData);

            } catch (e) {
                console.error(e.message);
            }
            that.openFile(fd)
        });
    }).on('error', (e) => {
        console.error(`错误: ${e.message}`);
    }).end();
};
Download.prototype.saveFile = function(infohash, data) {
    var path = `/torrent/${infohash}.torrent`;
    fs.writeFile(__dirname + path, data, function(err) {
        if (err) {
            console.log(err);
        }
    });
    this.insertDocuments(infohash, data, path);
}

Download.prototype.start = function() {
    var that = this;
    fs.readFile('./progress/progress_dl.txt', function(err, data) {
        if (err) {
            that.page = 0;
            that.position = 0;
        }
        try {
            var page = data.toString().split('/')[0] * 1;
            var position = data.toString().split('/')[1] * 1;
            that.page = page;
            that.position = position;
            console.log(that.page, that.position);
        } catch (e) {
            return console.log(e);
        }
        that.openFile();
        that.onexit();
        console.log('downloading...');
        that.connectdb();
    });
};
Download.prototype.onexit = function() {
    var that = this;
    process.on('SIGINT', function() {
        fs.writeFile('./progress/progress_dl.txt', that.page + '/' + that.position, function() {
            process.exit(0)
        })
    });
    process.on('beforeExit', function() {
        fs.writeFile('./progress/progress_dl.txt', that.page + '/' + that.position, function() {

        })
    });
};
//(new Download()).start();
var insertData = function(db, callback) {
    var path = __dirname + `/torrent/3.torrent`;
    fs.readFile(path, function(err, data) {
        if (err) {
            logger.error(err);
        }
        var collection = db.collection('documents');
        var file = bencode.decode(data);
        console.log(file.info);
        var info = {
            //infohash:infohash,
            name: file.info.name.toString(),
            type: 1,
            size: 0,
            fileNum: 0,
            files: [],
            hot: 0,
            createDate: 0,
            updateDate: 0,
        }
        if (file.info.files) {
            file.info.files.forEach(function(el) {
                info.size += el.length;
                //console.log(el.path.toString());
                var cfile = {
                    name: el.path.toString(),
                    size: el.length,
                    type: checkType(el.path)
                };
                info.files.push(cfile);
            })
            info.fileNum = file.info.files.length;
        } else {
            info.size = file.info.length;
            info.fileNum = 1;
        }
        info.type = checkType(file.info.name)
        info.createDate = info.updateDate = new Date().getTime();
        collection.insert(info, function(err, result) {
            console.log(result);

        });
    });

};
var checkType = function(name) {
    //1：视频，2：音频，3：图片，4：文本，5：网页，6：压缩包，0：未知
    var index, type
    try {
        index = name.toString().lastIndexOf('.');
        if (index) {
            type = name.substring(index + 1).toLowerCase();

        }
        //console.log(type);
    } catch (e) {

    }

    switch (true) {
        case /^(mp4|rm|rmvb|flv|mpg|mpeg|avi|mdf|mov|wmv|ts|mkv)$/.test(type):
            return 1;
        case /^(mp3|wma|wav|ogg|midi|ra)$/.test(type):
            return 2;
        case /^(jpg|jpeg|gif|bmp|tiff|png|pcx|tag)$/.test(type):
            return 3;
        case /^(txt)$/.test(type):
            return 4;
        case /^(html|htm|shtml|jsp|php|asp)$/.test(type):
            return 5;
        case /^(rar|zip|tar|gzip|7-zip|z)$/.test(type):
            return 6;
        default:
            return 0
    }
};