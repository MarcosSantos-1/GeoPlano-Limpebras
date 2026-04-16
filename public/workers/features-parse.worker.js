/* global self */
self.onmessage = function (e) {
  const text = e.data && e.data.text;
  if (typeof text !== "string") {
    self.postMessage({ ok: false, error: "missing text" });
    return;
  }
  try {
    const data = JSON.parse(text);
    self.postMessage({ ok: true, data });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) });
  }
};
