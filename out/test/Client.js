"use strict";
const peer_tracker_web_1 = require("../peer-tracker-web");
const test = require("blue-tape");
const crypto = require("crypto");
test("ws Client downloading scrape", (t) => {
    t.plan(14);
    let r = randomHash();
    let client = peer_tracker_web_1.default.ws("scrape", "0.0.0.0", 80, 6622, r, 10, 10, 10);
    client.on("announce", (interval, leechers, seeders, addresses) => {
        t.equal(interval, 1801, "announce - interval");
        t.equal(leechers, 0, "announce - leechers");
        t.equal(seeders, 0, "announce - seeders");
        t.equal(addresses.toString(), "", "announce - addresses");
    });
    client.on("scrape", (seeders, completed, leechers) => {
        t.equal(seeders, 0, "scrape - seeders");
        t.equal(completed, 0, "scrape - completed");
        t.equal(leechers, 0, "scrape - leechers");
    });
    setTimeout(() => {
        client = peer_tracker_web_1.default.ws("scrape", "0.0.0.0", 80, 6623, r, 10, 10, 10);
        client.on("announce", (interval, leechers, seeders, addresses) => {
            t.equal(interval, 1801, "announce - interval");
            t.equal(leechers, 1, "announce - leechers");
            t.equal(seeders, 0, "announce - seeders");
            t.equal(addresses.toString(), "0.0.0.0:0", "announce - addresses");
        });
        client.on("scrape", (seeders, completed, leechers) => {
            t.equal(seeders, 0, "scrape - seeders");
            t.equal(completed, 0, "scrape - completed");
            t.equal(leechers, 0, "scrape - leechers");
        });
    }, 1000);
});
function randomHash() {
    let num = Math.floor(Math.random() * (10000000 - 1)) + 1;
    let rh = crypto.createHash("sha1").update(num.toString()).digest("hex");
    return rh;
}
