"use strict";
var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var events_1 = require("events");
var writeUInt64BE = require("writeuint64be");
var websocket_1 = require("websocket");
var toBuffer = require("blob-to-buffer");
var buffer_1 = require("buffer");
var debug = require("debug")("PeerTracker:Client"), ACTION_CONNECT = 0, ACTION_ANNOUNCE = 1, ACTION_SCRAPE = 2, ACTION_ERROR = 3;
var connectionIdHigh = 0x417, connectionIdLow = 0x27101980;
function ws(announcement, trackerHost, port, myPort, infoHash, left, uploaded, downloaded) {
    return new ClientWeb("ws", announcement, trackerHost, port, myPort, infoHash, left, uploaded, downloaded);
}
exports.ws = ws;
var ClientWeb = (function (_super) {
    __extends(ClientWeb, _super);
    function ClientWeb(type, announcement, trackerHost, port, myPort, infoHash, left, uploaded, downloaded) {
        var _this = _super.call(this) || this;
        _this._debug = function () {
            var args = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                args[_i] = arguments[_i];
            }
            args[0] = "[" + _this._debugId + "] " + args[0];
            debug.apply(null, args);
        };
        if (!(_this instanceof ClientWeb))
            return new ClientWeb(type, announcement, trackerHost, port, myPort, infoHash, left, uploaded, downloaded);
        var self = _this;
        self._debugId = ~~((Math.random() * 100000) + 1);
        self._debug("peer-tracker Server instance created");
        self.TYPE = type;
        self.USER = "-EM0012-" + guidvC();
        self.CASE = announcement;
        self.HOST = trackerHost;
        self.HASH = (Array.isArray(infoHash)) ? infoHash.join("") : infoHash;
        self.PORT = port;
        self.MY_PORT = myPort;
        self.TRANSACTION_ID = null;
        self.EVENT = 0;
        self.LEFT = left;
        self.UPLOADED = uploaded;
        self.DOWNLOADED = downloaded;
        self.KEY = 0;
        self.IP_ADDRESS = 0;
        self.SCRAPE = false;
        self.HOST = "ws://" + self.HOST + ":" + self.PORT;
        self.server = new websocket_1.w3cwebsocket(self.HOST, "echo-protocol");
        self.server.onopen = function () {
            self.prepAnnounce();
        };
        self.server.onmessage = function (e) {
            toBuffer(e.data, function (err, buffer) {
                self.message(buffer);
            });
        };
        return _this;
    }
    ClientWeb.prototype.prepAnnounce = function () {
        var self = this;
        switch (self.CASE) {
            case "start":
                self.EVENT = 2;
                break;
            case "stop":
                self.EVENT = 3;
                setTimeout(function () {
                    self.server.close();
                }, 1500);
                break;
            case "complete":
                self.EVENT = 1;
                break;
            case "update":
                self.EVENT = 0;
                break;
            case "scrape":
                self.SCRAPE = true;
                self.EVENT = 2;
                self.scrape();
                return;
            default:
                self.emit("error", "Bad call signature.");
                return;
        }
        self.announce();
    };
    ClientWeb.prototype.sendPacket = function (buf) {
        var self = this;
        self.server.send(buf);
    };
    ClientWeb.prototype.startConnection = function () {
        var self = this;
        self.TRANSACTION_ID = ~~((Math.random() * 100000) + 1);
        var buf = new buffer_1.Buffer(16);
        buf.fill(0);
        buf.writeUInt32BE(connectionIdHigh, 0);
        buf.writeUInt32BE(connectionIdLow, 4);
        buf.writeUInt32BE(ACTION_CONNECT, 8);
        buf.writeUInt32BE(self.TRANSACTION_ID, 12);
        self.sendPacket(buf);
    };
    ClientWeb.prototype.scrape = function () {
        var self = this;
        if (!self.TRANSACTION_ID) {
            self.startConnection();
        }
        else {
            var hashBuf = buffer_1.Buffer.from(self.HASH, "hex");
            var buf = new buffer_1.Buffer(16);
            buf.fill(0);
            buf.writeUInt32BE(connectionIdHigh, 0);
            buf.writeUInt32BE(connectionIdLow, 4);
            buf.writeUInt32BE(ACTION_SCRAPE, 8);
            buf.writeUInt32BE(self.TRANSACTION_ID, 12);
            buf = buffer_1.Buffer.concat([buf, hashBuf]);
            self.sendPacket(buf);
        }
    };
    ClientWeb.prototype.announce = function () {
        var self = this;
        if (!self.TRANSACTION_ID) {
            self.startConnection();
        }
        else {
            var buf = new buffer_1.Buffer(98);
            buf.fill(0);
            buf.writeUInt32BE(connectionIdHigh, 0);
            buf.writeUInt32BE(connectionIdLow, 4);
            buf.writeUInt32BE(ACTION_ANNOUNCE, 8);
            buf.writeUInt32BE(self.TRANSACTION_ID, 12);
            buf.write(self.HASH, 16, 20, "hex");
            buf.write(self.USER, 36, 20);
            writeUInt64BE(buf, self.DOWNLOADED, 56);
            writeUInt64BE(buf, self.LEFT, 64);
            writeUInt64BE(buf, self.UPLOADED, 72);
            buf.writeUInt32BE(self.EVENT, 80);
            buf.writeUInt32BE(self.IP_ADDRESS, 84);
            buf.writeUInt32BE(self.KEY, 88);
            buf.writeInt32BE((-1), 92);
            buf.writeUInt16BE(self.MY_PORT, 96);
            self.sendPacket(buf);
            self.TRANSACTION_ID = null;
            connectionIdHigh = 0x417,
                connectionIdLow = 0x27101980;
        }
    };
    ClientWeb.prototype.message = function (msg) {
        var self = this;
        var buf;
        if (!buffer_1.Buffer.isBuffer(msg))
            buf = new buffer_1.Buffer(msg);
        else
            buf = msg;
        var action = buf.readUInt32BE(0);
        self.TRANSACTION_ID = buf.readUInt32BE(4);
        if (action === ACTION_CONNECT) {
            connectionIdHigh = buf.readUInt32BE(8);
            connectionIdLow = buf.readUInt32BE(12);
            if (self.SCRAPE)
                self.scrape();
            else
                self.announce();
        }
        else if (action === ACTION_SCRAPE) {
            for (var i = 0; i < (buf.length - 8); i += 20) {
                var seeders = buf.readUInt32BE(8 + i), completed = buf.readUInt32BE(12 + i), leechers = buf.readUInt32BE(16 + i);
                self.emit("scrape", seeders, completed, leechers);
            }
            self.announce();
        }
        else if (action === ACTION_ANNOUNCE) {
            var interval = buf.readUInt32BE(8), leechers = buf.readUInt32BE(12), seeders = buf.readUInt32BE(16), bufLength = buf.length, addresses = [];
            for (var i = 20; i < bufLength; i += 6) {
                var address = buf.readUInt8(i) + "." + buf.readUInt8(i + 1) + "." + buf.readUInt8(i + 2) + "." + buf.readUInt8(i + 3) + ":" + buf.readUInt16BE(i + 4);
                addresses.push(address);
            }
            self.emit("announce", interval, leechers, seeders, addresses);
            self.server.close();
        }
        else if (action === ACTION_ERROR) {
            var errorResponce = buf.slice(8).toString();
            self.emit("error", errorResponce);
            self.server.close();
        }
    };
    return ClientWeb;
}(events_1.EventEmitter));
function guidvC() {
    return Math.floor((1 + Math.random()) * 0x1000000000000)
        .toString(16)
        .substring(1);
}
