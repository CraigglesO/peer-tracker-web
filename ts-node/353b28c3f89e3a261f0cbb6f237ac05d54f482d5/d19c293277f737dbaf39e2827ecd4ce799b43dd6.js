"use strict";
const events_1 = require("events");
const buffer_1 = require("buffer");
const dgram = require("dgram");
const debug = require("debug");
debug("trackerClient");
const writeUInt64BE = require("writeUInt64BE"), ACTION_CONNECT = 0, ACTION_ANNOUNCE = 1, ACTION_SCRAPE = 2, ACTION_ERROR = 3;
let connectionIdHigh = 0x417, connectionIdLow = 0x27101980;
class UdpTracker extends events_1.EventEmitter {
    constructor(type, trackerHost, port, myPort, infoHash, left, uploaded, downloaded) {
        super();
        if (!(this instanceof UdpTracker))
            return new UdpTracker(type, trackerHost, port, myPort, infoHash, left, uploaded, downloaded);
        const self = this;
        self.USER = "-EM0012-" + guidvC();
        self.CASE = type;
        self.HOST = trackerHost;
        self.HASH = infoHash;
        self.PORT = port;
        self.MY_PORT = myPort;
        self.TRANSACTION_ID = null; // This will be our method of keeping track of new connections...
        self.EVENT = 0;
        // Avoid scraping unless it's a timed update
        self.SCRAPE = true;
        self.LEFT = left;
        self.UPLOADED = uploaded;
        self.DOWNLOADED = downloaded;
        self.KEY = 0;
        self.IP_ADDRESS = 0; // Default unless behind a proxy
        // Setup server
        self.server = dgram.createSocket("udp4");
        self.server.on("listening", function () {
            switch (self.CASE) {
                case "start":
                    self.EVENT = 2;
                    break;
                case "stop":
                    self.EVENT = 3;
                    setTimeout(() => {
                        // Close the server
                        self.server.close();
                    }, 300);
                    break;
                case "complete":
                    self.EVENT = 1;
                    break;
                case "update":
                    self.EVENT = 0;
                    break;
                case "scrape":
                    self.scrape();
                    self.EVENT = 2;
                    return;
                default:
                    self.emit("error", "Bad call signature.");
                    return;
            }
            self.announce();
        });
        self.server.on("message", function (msg, rinfo) { self.message(msg, rinfo); });
        self.server.bind(self.MY_PORT);
    }
    sendPacket(buf) {
        const self = this;
        self.server.send(buf, 0, buf.length, self.PORT, self.HOST, (err) => {
            if (err) {
                self.emit("error", err);
            }
        });
    }
    startConnection() {
        const self = this;
        // Prepare for the next connection:
        self.TRANSACTION_ID = ~~((Math.random() * 100000) + 1);
        // Prep a packet for delivery:
        let buf = new buffer_1.Buffer(16);
        buf.fill(0);
        buf.writeUInt32BE(connectionIdHigh, 0); // 0    64-bit integer  connection_id   0x41727101980
        buf.writeUInt32BE(connectionIdLow, 4); // 0    64-bit integer  connection_id   0x41727101980
        buf.writeUInt32BE(ACTION_CONNECT, 8); // 8    32-bit integer  action          0 // connect
        buf.writeUInt32BE(self.TRANSACTION_ID, 12); // 12   32-bit integer  transaction_id
        // Send packet
        self.sendPacket(buf);
    }
    scrape() {
        const self = this;
        if (!self.TRANSACTION_ID) {
            self.startConnection();
        }
        else {
            let buf = new buffer_1.Buffer(36);
            buf.fill(0);
            buf.writeUInt32BE(connectionIdHigh, 0); // 0             64-bit integer  connection_id   0x41727101980
            buf.writeUInt32BE(connectionIdLow, 4); // 0             64-bit integer  connection_id   0x41727101980
            buf.writeUInt32BE(ACTION_SCRAPE, 8); // 8             32-bit integer  action          2 // scrape
            buf.writeUInt32BE(self.TRANSACTION_ID, 12); // 12            32-bit integer  transaction_id
            buf.write(self.HASH, 16, 20, "hex"); // 16 + 20 * n   20-byte string  info_hash
            // Send Packet
            self.sendPacket(buf);
        }
    }
    announce() {
        // EVENT: 0: none; 1: completed; 2: started; 3: stopped
        const self = this;
        if (!self.TRANSACTION_ID) {
            self.startConnection();
        }
        else {
            // Prepare announce packet for delivery
            let buf = new buffer_1.Buffer(98);
            buf.fill(0);
            buf.writeUInt32BE(connectionIdHigh, 0); //   0    64-bit integer  connection_id
            buf.writeUInt32BE(connectionIdLow, 4); //   0    64-bit integer  connection_id
            buf.writeUInt32BE(ACTION_ANNOUNCE, 8); //   8    32-bit integer  action          1 // announce
            buf.writeUInt32BE(self.TRANSACTION_ID, 12); //   12   32-bit integer  transaction_id
            buf.write(self.HASH, 16, 20, "hex"); //   16   20-byte string  info_hash
            buf.write(self.USER, 36, 20); //   36   20-byte string  peer_id
            writeUInt64BE(buf, self.DOWNLOADED, 56); //   56   64-bit integer  downloaded
            writeUInt64BE(buf, self.LEFT, 64); //   64   64-bit integer  left
            writeUInt64BE(buf, self.UPLOADED, 72); //   72   64-bit integer  uploaded
            buf.writeUInt32BE(self.EVENT, 80); //   80   32-bit integer  event           0 // 0: none; 1: completed; 2: started; 3: stopped
            buf.writeUInt32BE(self.IP_ADDRESS, 84); //   84   32-bit integer  IP address      0 // default
            buf.writeUInt32BE(self.KEY, 88); //   88   32-bit integer  key
            buf.writeInt32BE((-1), 92); //   92   32-bit integer  num_want        -1 // default
            buf.writeUInt16BE(self.MY_PORT, 96); //   96   16-bit integer  port
            // Send Packet
            self.sendPacket(buf);
            self.TRANSACTION_ID = null;
            connectionIdHigh = 0x417,
                connectionIdLow = 0x27101980;
        }
    }
    message(msg, rinfo) {
        const self = this;
        let buf = new buffer_1.Buffer(msg);
        let action = buf.readUInt32BE(0); // 0   32-bit integer  action   0 // connect 1 // announce 2 // scrape 3 // error
        self.TRANSACTION_ID = buf.readUInt32BE(4); // 4   32-bit integer  transaction_id
        if (action === ACTION_CONNECT) {
            // Server will establish a new connection_id to talk on.
            // This connection_id dies after 5-10 seconds.
            connectionIdHigh = buf.readUInt32BE(8); // 0   64-bit integer  connection_id
            connectionIdLow = buf.readUInt32BE(12); // 0   64-bit integer  connection_id
            // Announce
            self.announce();
        }
        else if (action === ACTION_SCRAPE) {
            let seeders = buf.readUInt32BE(8), //  8    32-bit integer  interval
            completed = buf.readUInt32BE(12), //  12   32-bit integer  completed
            leechers = buf.readUInt32BE(16); //  16   32-bit integer  leechers
            self.emit("scrape", seeders, completed, leechers);
            self.announce();
        }
        else if (action === ACTION_ANNOUNCE) {
            let interval = buf.readUInt32BE(8), //  8           32-bit integer  interval
            leechers = buf.readUInt32BE(12), //  12          32-bit integer  leechers
            seeders = buf.readUInt32BE(16), //  16          32-bit integer  seeders
            bufLength = buf.length, //  20 + 6 * n  32-bit integer  IP address
            addresses = []; //  24 + 6 * n  16-bit integer  TCP port
            for (let i = 20; i < bufLength; i += 6) {
                let address = `${buf.readUInt8(i)}.${buf.readUInt8(i + 1)}.${buf.readUInt8(i + 2)}.${buf.readUInt8(i + 3)}:${buf.readUInt16BE(i + 4)}`;
                addresses.push(address);
            }
            // Send up
            self.emit("announce", interval, leechers, seeders, addresses);
            // Close the server
            self.server.close();
        }
        else if (action === ACTION_ERROR) {
            let errorResponce = buf.slice(8).toString();
            self.emit("error", errorResponce);
            // Close the server
            self.server.close();
        }
    }
}
exports.UdpTracker = UdpTracker;
class WssTracker extends events_1.EventEmitter {
    constructor() {
        super();
        if (!(this instanceof WssTracker))
            return new WssTracker();
        const self = this;
    }
}
exports.WssTracker = WssTracker;
function guidvC() {
    return Math.floor((1 + Math.random()) * 0x1000000000000)
        .toString(16)
        .substring(1);
}
//# sourceMappingURL=/Users/connor/Desktop/2017/PeerTracker/node/ts-node/353b28c3f89e3a261f0cbb6f237ac05d54f482d5/d19c293277f737dbaf39e2827ecd4ce799b43dd6.js.map