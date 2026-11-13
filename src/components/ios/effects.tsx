/** CSS materials keep the native WebView lightweight; no canvas or render loop. */
export function LiquidIndicator() {
  return <span className="ios-liquid-fill" />;
}

export function Loader({ className = "", label = "불러오는 중" }: { className?: string; label?: string }) {
  return <span role="status" aria-label={label} className={`ios-loader ${className}`} />;
}
