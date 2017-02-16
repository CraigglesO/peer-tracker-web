"use strict";
var crypto = require("crypto");
function randomHash() {
    var num = Math.floor(Math.random() * (10000000 - 1)) + 1;
    var rh = crypto.createHash("sha1").update(num.toString()).digest("hex");
    return rh;
}
