/**
 * 网络诊断报告：把 `net_diag` 的 JSON 变成人一眼能读的分段文本。
 *
 * 设计目标——用户点一下「网络诊断」复制出来的东西，直接贴到 issue 里，
 * 维护者不用问「你说的是哪个错」：
 *
 *   1. 第一行是结论（verdict + summary），不用读数据就能定性
 *   2. 分段给耗时/状态，扫一眼就知道卡在 DNS、TCP 还是 TLS
 *   3. 建议直接可执行
 *   4. 原始 JSON 附在末尾，机器也能解析
 */

type Json = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const ms = (v: unknown): string => {
  const n = num(v);
  return n == null ? "?" : `${n}ms`;
};

const pad = (label: string, width = 10) => label + " ".repeat(Math.max(0, width - label.length));

/** 结论 → 一句话人话（verdict 是稳定的英文码，方便 grep 统计） */
const VERDICT_TEXT: Record<string, string> = {
  ok: "정상 연결",
  ok_proxy: "프록시/TUN 사용 중, 정상 연결",
  fake_ip: "프록시/TUN 사용 중 (fake-ip)",
  dns_fail: "DNS 조회 실패",
  dns_false_alarm: "DNS 검사 오류, 실제 연결은 정상",
  dns_hijack: "DNS가 내부망 또는 예약 주소로 변조됨",
  tcp_timeout: "직접 TCP 연결 검사 시간 초과",
  tcp_refused: "직접 TCP 연결 검사 거부됨",
  tls_intercept: "TLS 인증서 검증 실패",
  tls_fail: "TLS 핸드셰이크 실패",
  proxy_fail: "프록시 요청 실패",
  http_fail: "HTTP 요청 실패",
  http_status: "서버가 오류 상태 코드를 반환함",
  unknown: "정보 부족",
};

export function formatNetDiag(raw: Json): string {
  const dns = obj(raw.dns);
  const tcp = obj(raw.tcp);
  const http = obj(raw.http);
  const env = obj(raw.env);
  const rt = obj(raw.runtime);

  const verdict = str(raw.verdict) || "unknown";
  const summary = str(raw.summary);
  const lines: string[] = [];

  /* ── 头部：时间 + 结论 ── */
  const when = new Date().toLocaleString("zh-CN", { hour12: false });
  lines.push(`【HGhubX 네트워크 진단】${when}`);
  lines.push("");
  lines.push(`결과: ${summary || VERDICT_TEXT[verdict] || verdict}`);
  lines.push(`코드: ${verdict}（${VERDICT_TEXT[verdict] ?? "미분류"}）`);
  lines.push("");

  /* ── 环境 ── */
  lines.push("── 실행 환경 ──────────────────────");
  const os = [str(rt.os), str(rt.arch)].filter(Boolean).join(" ");
  if (os) lines.push(`${pad("플랫폼")}${os}`);
  if (str(rt.ver)) lines.push(`${pad("버전")}${str(rt.ver)}`);
  lines.push(`${pad("서버")}${str(raw.base) || "-"}`);
  lines.push(`${pad("호스트")}${str(raw.host) || "-"}`);
  lines.push("");

  /* ── DNS ── */
  lines.push("── DNS ───────────────────────────");
  if (str(dns.error)) {
    const detail = str(dns.detail);
    lines.push(`${pad("상태")}실패 · ${str(dns.error)}${dns.timeout ? "(6초 시간 초과)" : ` · ${ms(dns.ms)}`}`);
    if (detail) lines.push(`${pad("원인")}${detail}`);
  } else {
    const kinds = arr(dns.kinds).map(String);
    const count = num(dns.count);
    lines.push(`${pad("상태")}${ms(dns.ms)} · ${count ?? 0}개 레코드`);
    lines.push(`${pad("유형")}${kinds.length ? kinds.join(", ") : "-"}`);
    const suspicious = arr(dns.suspicious).map(String);
    if (suspicious.length) lines.push(`${pad("의심 주소")}${suspicious.join(", ")}`);
    if (dns.has_fake_ip) lines.push(`${pad("판정")}fake-ip: Clash / Surge 등의 TUN이 DNS를 처리 중`);
  }
  lines.push("");

  /* ── TCP ── */
  lines.push("── TCP ───────────────────────────");
  if (tcp.skipped) {
    lines.push(`${pad("상태")}건너뜀 · ${str(tcp.reason) || "조회 결과 없음"}`);
  } else {
    const ok = tcp.ok === true;
    const state = ok ? "연결 가능" : tcp.timeout ? "시간 초과 (응답 없음)" : "실패";
    const path = tcp.proxy_bypassed === true ? "직접 연결 검사 (앱 HTTP 프록시 우회)" : "독립 TCP 소켓 검사";
    const family = str(tcp.family) ? `${str(tcp.family)} · ` : "";
    lines.push(`${pad("상태")}${path} · ${family}${state} · ${ms(tcp.ms)}`);
    if (str(tcp.addr)) lines.push(`${pad("대상")}${str(tcp.addr)}`);
    if (str(tcp.error)) lines.push(`${pad("오류")}${str(tcp.error)}`);
  }
  lines.push("");

  /* ── HTTP ── */
  lines.push("── HTTP ──────────────────────────");
  const status = num(http.status);
  if (status != null) lines.push(`${pad("상태")}${status} · ${ms(http.ms)}`);
  else lines.push(`${pad("상태")}실패 · ${ms(http.ms)}`);
  lines.push(`${pad("프록시 경로")}${http.proxy_configured === true ? "일치하는 앱 HTTP 프록시 설정 감지됨" : http.proxy_configured === false ? "앱 HTTP 프록시 설정 없음 (VPN/TUN이 처리할 수 있음)" : "기록 없음"}`);
  if (str(http.kind)) lines.push(`${pad("오류 유형")}${str(http.kind)}`);
  if (str(http.error)) lines.push(`${pad("오류")}${str(http.error)}`);
  lines.push("");

  /* ── 应用代理 ── */
  if (str(env.app_proxy_mode)) {
    const labels: Record<string, string> = { system: "시스템 설정 사용", custom: "사용자 지정 프록시", off: "직접 연결" };
    lines.push("── 앱 프록시 ──────────────────────");
    lines.push(`${pad("모드")}${labels[str(env.app_proxy_mode)] || str(env.app_proxy_mode)}`);
    if (str(env.app_proxy)) lines.push(`${pad("출구")}${str(env.app_proxy)}`);
    lines.push("");
  }

  /* ── 代理环境变量 ── */
  const envLines = Object.entries(env)
    .map(([k, v]) => `${k}=${v == null ? "-" : String(v)}`)
    .sort();
  lines.push("── 시스템 프록시 ──────────────────────");
  lines.push(envLines.length ? envLines.join("  |  ") : "관련 환경 변수 없음");
  lines.push("");

  /* ── 建议 ── */
  const advice = arr(raw.advice).map(String).filter(Boolean);
  if (advice.length) {
    lines.push("── 권장 사항 ──────────────────────────");
    advice.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
    lines.push("");
  }

  /* ── 原始数据 ── */
  lines.push("── 원본 데이터 (JSON) ───────────────");
  lines.push(JSON.stringify(raw, null, 2));

  return lines.join("\n");
}

/** 一句话摘要，给 toast / 日志用，不占屏。 */
export function shortVerdict(raw: Json): string {
  const verdict = str(raw.verdict) || "unknown";
  return `${verdict} · ${str(raw.summary) || VERDICT_TEXT[verdict] || "알 수 없음"}`;
}
