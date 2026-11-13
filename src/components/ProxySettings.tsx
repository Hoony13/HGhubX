import { useEffect, useRef, useState } from "react";
import { api, isMobile, type ProxyMode, type ProxyProbe, type ProxyState } from "../api";
import { useStore } from "../store";
import { IChevR, IClose, ILink } from "../icons";
import { Button, Input, SegmentedControl } from "./ios/controls";
import { Modal, Sheet } from "./ui";

const MODES: ProxyMode[] = ["system", "custom", "off"];
const LABELS: Record<ProxyMode, string> = { system: "시스템 설정 사용", custom: "사용자 지정", off: "직접 연결" };
const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : typeof error === "string" ? error : fallback;

function summary(state: ProxyState | null, failed: boolean): string {
  if (!state) return failed ? "읽지 못했습니다. 열어서 다시 시도해 주세요" : "읽는 중…";
  if (state.mode === "off") return "직접 연결 · 시스템 프록시 및 환경 변수 무시";
  if (state.effective) return `${LABELS[state.mode]} · ${state.effective}`;
  return state.mode === "custom" ? "사용자 지정 프록시" : state.system_proxy || state.env_proxy ? "시스템 설정 사용 · 프록시 감지됨" : "시스템 설정 사용 · 프록시 없음";
}

/** Uses the same shared controls as the line picker and keeps proxy credentials out of summaries/logs. */
export default function ProxySettings() {
  const { toast } = useStore();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ProxyState | null>(null);
  const [mode, setMode] = useState<ProxyMode>("system");
  const [url, setUrl] = useState("");
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "test" | "save">("");
  const [probe, setProbe] = useState<ProxyProbe | null>(null);
  const request = useRef(0);
  const probeGeneration = useRef(0);
  const pending = useRef(false);

  const read = async (fillDraft: boolean) => {
    const generation = ++request.current;
    setLoading(true);
    setLoadError("");
    if (fillDraft) setReady(false);
    try {
      const next = await api.proxyState();
      if (generation !== request.current) return;
      setState(next);
      if (fillDraft) {
        setMode(next.mode);
        setUrl(next.url || "");
        setReady(true);
      }
    } catch (failure) {
      if (generation === request.current) setLoadError(message(failure, "프록시 설정을 읽지 못했습니다. 다시 시도해 주세요"));
    } finally {
      if (generation === request.current) setLoading(false);
    }
  };

  useEffect(() => {
    void read(false);
    const invalidateProbe = () => { probeGeneration.current++; setProbe(null); };
    window.addEventListener("hg:line-changed", invalidateProbe);
    return () => { request.current++; probeGeneration.current++; window.removeEventListener("hg:line-changed", invalidateProbe); };
  }, []);

  const openForm = () => {
    setOpen(true);
    setVisible(false);
    setProbe(null);
    setError("");
    void read(true);
  };
  const close = () => {
    if (pending.current) return;
    request.current++;
    setOpen(false);
    setVisible(false);
  };
  const change = () => { probeGeneration.current++; setProbe(null); setError(""); };
  const run = async (action: "test" | "save") => {
    if (pending.current || !ready) return;
    if (mode === "custom" && !url.trim()) {
      setError("프록시 주소를 입력해 주세요");
      return;
    }
    pending.current = true;
    setBusy(action);
    setError("");
    setProbe(null);
    const generation = ++probeGeneration.current;
    try {
      if (action === "test") {
        const result = await api.proxyTest(mode, mode === "custom" ? url.trim() : "");
        if (generation === probeGeneration.current) setProbe(result);
        else setError("서버가 변경되었습니다. 현재 서버를 다시 검사해 주세요");
      } else {
        const next = await api.proxySet(mode, mode === "custom" ? url.trim() : "");
        setState(next);
        setMode(next.mode);
        setUrl(next.url || "");
        setOpen(false);
        setVisible(false);
        window.dispatchEvent(new Event("hg:proxy-changed"));
        toast(`프록시 설정 저장 완료 · ${LABELS[next.mode]}`, "ok");
      }
    } catch (failure) {
      setError(message(failure, action === "test" ? "프록시 검사 실패" : "프록시 설정 저장 실패"));
    } finally {
      pending.current = false;
      setBusy("");
    }
  };

  const disabled = !ready || loading || !!busy;
  const body = <div className="flex flex-col min-h-0" style={{ maxHeight: isMobile ? "74vh" : "min(78vh, 640px)" }}>
    <div className="shrink-0 flex items-center gap-3 px-4 pt-3 pb-2">
      <span className="ios-setting-icon" aria-hidden="true"><ILink size={16} /></span>
      <h2 className="flex-1 text-[16px] font-bold text-on">프록시 연결</h2>
      <Button aria-label="프록시 설정 닫기" disabled={!!busy} onClick={close} className="min-h-12 min-w-12 flex items-center justify-center"><IClose size={18} /></Button>
    </div>
    <form className="scroll-y px-4 pb-5 space-y-4" onSubmit={(event) => { event.preventDefault(); void run("save"); }}>
      <p className="text-[13px] text-mut leading-relaxed">HGhubX에만 적용됩니다. 입력한 설정으로 연결을 검사한 뒤 앱의 네트워크 설정으로 저장할 수 있습니다.</p>
      {loadError && <div role="alert" className="text-[13px] text-danger">
        {loadError}
        <Button onClick={() => { void read(true); }} disabled={loading} className="min-h-12 px-3 ml-1 text-primary">다시 읽기</Button>
      </div>}
      {loading && <p role="status" className="text-[13px] text-mut">프록시 설정을 읽는 중…</p>}
      <SegmentedControl aria-label="프록시 모드" activeIndex={MODES.indexOf(mode)}>
        {MODES.map(value => <Button key={value} disabled={disabled} aria-pressed={mode === value}
          className="min-h-12" onClick={() => { setMode(value); change(); }}>{LABELS[value]}</Button>)}
      </SegmentedControl>
      {mode === "custom" && <div>
        <label htmlFor="proxy-address" className="block text-[14px] text-on mb-2">프록시 주소</label>
        <Input id="proxy-address" aria-label="프록시 주소" type={visible ? "text" : "password"} value={url}
          disabled={disabled} autoComplete="off" autoCapitalize="none" spellCheck={false}
          placeholder="http://127.0.0.1:7890" aria-invalid={!!error} aria-describedby={`proxy-address-hint${error ? " proxy-form-error" : ""}`}
          className="w-full min-h-12 min-w-0 text-[14px]" onChange={event => { setUrl(event.target.value); change(); }} />
        <div className="flex items-start gap-2 mt-1">
          <p id="proxy-address-hint" className="flex-1 text-[12px] text-mut leading-relaxed pt-2">HTTP, HTTPS, SOCKS를 지원합니다. 휴대전화에서 127.0.0.1은 휴대전화 자체를 가리킵니다. 컴퓨터의 프록시를 사용하려면 컴퓨터의 내부망 주소를 입력하세요.</p>
          <Button onClick={() => setVisible(value => !value)} aria-pressed={visible} className="min-h-12 shrink-0 px-2 text-[12px] text-primary">{visible ? "주소 숨기기" : "주소 표시"}</Button>
        </div>
      </div>}
      {mode !== "custom" && <p className="text-[13px] text-mut leading-relaxed">{mode === "system" ? "시스템 프록시와 환경 변수를 사용합니다. 저장된 사용자 지정 주소는 유지됩니다." : "시스템 프록시와 환경 변수를 무시하고 현재 서버에 직접 연결합니다. 저장된 사용자 지정 주소는 유지됩니다."}</p>}
      {error && <p id="proxy-form-error" role="alert" className="text-[13px] text-danger break-words">{error}</p>}
      <div role="status" aria-live="polite" className={`text-[13px] break-words ${probe && !probe.ok ? "text-danger" : "text-mut"}`}>
        {busy === "test" ? "입력한 설정을 검사하는 중…" : probe ? probe.ok ? `사용 가능 · ${probe.ms}ms` : `연결 실패 · ${probe.error || (probe.status ? `HTTP ${probe.status}` : "주소와 네트워크를 확인해 주세요")}` : "입력한 설정으로만 검사합니다. 저장해야 적용됩니다."}
      </div>
      <div className="flex gap-3">
        <Button variant="secondary" disabled={disabled} onClick={() => { void run("test"); }} className="min-h-12 flex-1 px-3">{busy === "test" ? "검사 중…" : "연결 테스트"}</Button>
        <Button variant="primary" type="submit" disabled={disabled} className="min-h-12 flex-1 px-3">{busy === "save" ? "저장 중…" : "프록시 저장"}</Button>
      </div>
    </form>
  </div>;

  return <>
    <Button onClick={openForm} className="w-full flex items-center gap-3 px-3.5 py-3 text-left pressable">
      <span className="ios-setting-icon" aria-hidden="true"><ILink size={16} /></span>
      <div className="flex-1 min-w-0"><div className="text-[14px] text-on">프록시 연결</div><div className="text-[12px] text-mut truncate">{summary(state, !!loadError)}</div></div>
      <IChevR size={15} className="text-mut" />
    </Button>
    {isMobile ? <Sheet open={open} onClose={close} label="프록시 연결">{body}</Sheet> : <Modal open={open} onClose={close} label="프록시 연결" width={460}>{body}</Modal>}
  </>;
}
