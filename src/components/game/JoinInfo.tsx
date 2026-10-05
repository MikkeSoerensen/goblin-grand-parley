import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

const isLoopback = (host: string) => host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";

// Shows the address (and a QR code) other devices on the Wi-Fi should open.
export function JoinInfo() {
  const [urls, setUrls] = useState<string[]>(() =>
    isLoopback(location.hostname) ? [] : [location.origin],
  );

  useEffect(() => {
    if (!isLoopback(location.hostname)) return;
    let cancelled = false;
    fetch("/api/lan")
      .then(r => (r.ok ? r.json() : { addresses: [] }))
      .then((d: { addresses?: unknown }) => {
        if (cancelled || !Array.isArray(d.addresses)) return;
        const port = location.port ? `:${location.port}` : "";
        setUrls(d.addresses.filter((a): a is string => typeof a === "string").map(a => `${location.protocol}//${a}${port}`));
      })
      .catch(() => { /* server too old or offline — the text fallback below covers it */ });
    return () => { cancelled = true; };
  }, []);

  if (urls.length === 0) {
    return (
      <p className="text-xs opacity-70 font-ui">
        Friends open this game's address on their own device — the server window lists it under <b>LAN</b>.
      </p>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4 bg-black/30 rounded-lg p-3">
      <div className="bg-white p-2 rounded shrink-0">
        <QRCodeSVG value={urls[0]} size={128} aria-label={`QR code for ${urls[0]}`}/>
      </div>
      <div className="text-left min-w-0">
        <div className="text-xs opacity-70 font-ui mb-1">Scan, or open on a device on the same Wi-Fi:</div>
        {urls.map(u => (
          <div key={u} className="font-mono text-sm break-all select-all">{u}</div>
        ))}
      </div>
    </div>
  );
}
