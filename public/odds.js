/* DBBet Kenya — live odds widget
 * Fetches /api/odds (Cloudflare Worker proxy) and renders live + upcoming
 * football/top-sport matches with 1X2 odds. Degrades to a CTA if there's
 * nothing to show or the feed isn't configured yet, so it never looks broken.
 *
 * NOTE: the field mapping in mapEvent()/extract1x2() is written defensively and
 * will be tightened to the exact Marketing API fields after the first real
 * authenticated response is inspected.
 */
(function () {
  var root = document.getElementById("odds-widget");
  if (!root) return;

  var endpoint = root.dataset.endpoint || "/api/odds";
  var betLink = root.dataset.betLink || "#";
  var grid = root.querySelector(".odds-grid");
  var fallback = root.querySelector(".odds-fallback");
  var updated = root.querySelector(".odds-updated");
  var tabs = Array.prototype.slice.call(root.querySelectorAll(".odds-tab"));

  var data = { live: [], prematch: [] };
  var active = "live";

  skeletons(6);

  tabs.forEach(function (t) {
    t.addEventListener("click", function () {
      active = t.dataset.feed;
      syncTabs();
      render();
    });
  });

  fetch(endpoint, { headers: { Accept: "application/json" } })
    .then(function (r) { return r.json(); })
    .then(function (json) {
      data.live = normalizeFeed(json && json.live, true);
      data.prematch = normalizeFeed(json && json.prematch, false);
      if (json && json.updatedAt) setUpdated(json.updatedAt);
      if (!data.live.length && data.prematch.length) { active = "prematch"; syncTabs(); }
      render();
    })
    .catch(function () { render(); });

  /* ------------------------------ render ------------------------------ */

  function render() {
    var list = data[active] || [];
    grid.dataset.state = "ready";
    if (!list.length) {
      grid.innerHTML = "";
      grid.hidden = true;
      fallback.hidden = false;
      return;
    }
    grid.hidden = false;
    fallback.hidden = true;
    grid.innerHTML = list.map(card).join("");
  }

  function card(ev) {
    var when = ev.live
      ? '<span class="odds-when is-live">' + esc(ev.time || "Live") + "</span>"
      : '<span class="odds-when">' + esc(ev.time || "") + "</span>";
    var labels = ["1", "X", "2"];
    var picks = labels.map(function (lbl, i) {
      var o = ev.odds[i];
      if (o == null) {
        return '<span class="odds-pick is-empty"><span class="odds-lbl">' + lbl +
          '</span><span class="odds-val">&ndash;</span></span>';
      }
      return '<a class="odds-pick" rel="nofollow sponsored" href="' + esc(ev.link || betLink) +
        '"><span class="odds-lbl">' + lbl + '</span><span class="odds-val">' + fmt(o) + "</span></a>";
    }).join("");
    return '<article class="odds-card"><div class="odds-top">' +
      '<span class="odds-league">' + esc(ev.league || "Football") + "</span>" + when + "</div>" +
      '<div class="odds-teams"><div class="odds-team">' + esc(ev.home || "&mdash;") +
      '</div><div class="odds-vs">vs</div><div class="odds-team">' + esc(ev.away || "&mdash;") + "</div></div>" +
      '<div class="odds-markets">' + picks + "</div></article>";
  }

  /* -------------------- normalization (to refine) -------------------- */

  function normalizeFeed(feed, live) {
    return extractArray(feed)
      .map(function (e) { return mapEvent(e, live); })
      .filter(function (e) { return e && (e.home || e.away); })
      .slice(0, 10);
  }

  function extractArray(feed) {
    if (Array.isArray(feed)) return feed;
    if (!feed || typeof feed !== "object") return [];
    var keys = ["sportEvents", "events", "data", "items", "result", "list"];
    for (var i = 0; i < keys.length; i++) if (Array.isArray(feed[keys[i]])) return feed[keys[i]];
    for (var k in feed) if (Array.isArray(feed[k]) && feed[k].length && typeof feed[k][0] === "object") return feed[k];
    return [];
  }

  function mapEvent(e, live) {
    return {
      home: pick(e, ["opp1Name", "team1Name", "name1", "homeName", "home", "competitor1"]),
      away: pick(e, ["opp2Name", "team2Name", "name2", "awayName", "away", "competitor2"]),
      league: pick(e, ["tournamentName", "tournament", "league", "champName", "competition"]),
      live: live,
      time: formatWhen(pick(e, ["dateStart", "startTime", "start", "timestamp"]), live),
      odds: extract1x2(e),
      link: pick(e, ["link", "url", "deeplink"]),
    };
  }

  function extract1x2(e) {
    var markets = e.markets || e.odds || e.oddsList || [];
    if (!Array.isArray(markets)) return [null, null, null];
    // TODO: select by real market `type` codes for W1/Draw/W2 once confirmed.
    var vals = markets
      .map(function (m) { return m && (m.oddsMarket != null ? m.oddsMarket : m.odds != null ? m.odds : m.value); })
      .filter(function (v) { return typeof v === "number"; });
    return [vals[0] != null ? vals[0] : null, vals[1] != null ? vals[1] : null, vals[2] != null ? vals[2] : null];
  }

  /* ------------------------------ helpers ------------------------------ */

  function pick(o, keys) {
    for (var i = 0; i < keys.length; i++) {
      var v = o[keys[i]];
      if (v != null && v !== "") return v;
    }
    return "";
  }

  function formatWhen(ts, live) {
    if (live) return "Live";
    var n = Number(ts);
    if (!n) return "";
    if (n < 1e12) n *= 1000; // seconds → ms
    var d = new Date(n);
    if (isNaN(d)) return "";
    var now = new Date();
    var opts = { hour: "2-digit", minute: "2-digit" };
    var t = d.toLocaleTimeString([], opts);
    if (d.toDateString() === now.toDateString()) return "Today " + t;
    return d.toLocaleDateString([], { day: "numeric", month: "short" }) + " " + t;
  }

  function fmt(v) { return (Math.round(Number(v) * 100) / 100).toFixed(2); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function setUpdated(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return;
    updated.hidden = false;
    updated.textContent = "Updated " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function syncTabs() {
    tabs.forEach(function (x) { x.classList.toggle("is-active", x.dataset.feed === active); });
  }

  function skeletons(n) {
    var html = "";
    for (var i = 0; i < n; i++) html += '<article class="odds-card is-skeleton"></article>';
    grid.innerHTML = html;
  }
})();
