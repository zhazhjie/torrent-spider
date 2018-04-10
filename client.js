const dgram = require('dgram');
const client = dgram.createSocket('udp4');
var bencode = require('bencode');


client.on('close',()=>{
    console.log('socket close');
});

client.on('error',(err)=>{
    console.log(err);
});
client.on('message',(msg,rinfo)=>{
    var msg=bencode.decode(msg)
    var id=msg
    console.log(id,rinfo);
    client.close();
});
var msg={"t":"aa", "y":"q","q":"find_node", "a":{"id":"abcdefghij0123456789","target":"mnopqrstuvwxyz123456"}}
var msg=bencode.encode(msg);
client.send(msg,0,msg.length,6881,'router.bittorrent.com');