(function () {
  var root = document.querySelector("[data-checkout-session-id]");
  if (!root) return;

  var sessionId = root.getAttribute("data-checkout-session-id");
  var initialStatus = root.getAttribute("data-checkout-status");
  if (!sessionId || initialStatus === "paid" || initialStatus === "failed") return;

  async function pollStatus() {
    if (document.hidden) {
      window.setTimeout(pollStatus, 10000);
      return;
    }

    try {
      var response = await fetch("/api/checkout-status/" + encodeURIComponent(sessionId) + "/", {
        cache: "no-store",
        credentials: "omit"
      });
      if (response.ok) {
        var data = await response.json();
        if (data.status && data.status !== initialStatus) {
          window.location.reload();
          return;
        }
      } else if (response.status === 404 || response.status === 410) {
        window.location.reload();
        return;
      }
    } catch (_) {}
    window.setTimeout(pollStatus, 10000);
  }

  window.setTimeout(pollStatus, 10000);
})();
