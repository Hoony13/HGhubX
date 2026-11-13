import { Button, Input, Surface } from "./ios/controls";
import { Loader } from "./ios/effects";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, hostOf, isMobile, type LineApply, type LineItem, type LineProbe, type LineState } from "../api";
import { tracePlayback } from "../playbackDiagnostics";
import { autoLineEnabled, setAutoLine } from "../autoLine";
import { useStore } from "../store";
import { Modal, Sheet } from "./ui";
import { ICheck, IClose, IRefresh, ISettings } from "../icons";

type ProbeMap = Record<string, LineProbe>;

/* 单条线路：左侧点一下即切换，右侧单独检测 */
function Row({ item, current, probe, busy, disabled, onPick, onProbe }: {
  item: LineItem; current: boolean; probe?: LineProbe; busy: boolean; disabled: boolean;
  onPick: (url: string) => void; onProbe: (url: string) => void;
}) {
  return (
    <div className={`flex items-center gap-2 px-3.5 py-2.5 ${current ? "bg-s3/70" : ""}`}>
      <Button onClick={() => onPick(item.url)} disabled={disabled} className="flex-1 min-w-0 text-left pressable disabled:opacity-60">
        <div className="flex items-center gap-1.5 text-[14px] text-on">
          <span className="truncate">{item.name || item.host || hostOf(item.url)}</span>
          {current && <ICheck size={13} className="text-mint shrink-0" />}
        </div>
        <div className="text-[12px] text-mut truncate mt-0.5">{item.url}</div>
      </Button>
      <span
        title={probe ? (probe.error || (probe.status ? `HTTP ${probe.status}` : "")) : ""}
        className={`text-[12px] tabular-nums shrink-0 ${probe ? (probe.ok ? "text-mint" : "text-danger") : "text-dim"}`}>
        {busy ? "…" : probe ? (probe.ok ? `${probe.ms}ms` : probe.status ? `HTTP ${probe.status}` : "실패") : "—"}
      </span>
      <Button onClick={() => onProbe(item.url)} disabled={busy || disabled}
        className="shrink-0 h-7 px-2.5 rounded-(--r-sm) bg-s4 text-[12px] text-on/80 pressable disabled:opacity-50">검사</Button>
    </div>
  );
}

/* 分组头：标题 + 说明 + 右侧动作。三组共用，别再有的按钮在头、有的在尾 */
function GroupHead({ title, hint, actions }: { title: string; hint: string; actions?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-1 mt-4 mb-1.5 first:mt-1">
      <span className="text-[12px] font-semibold text-dim tracking-wide shrink-0">{title}</span>
      <span className="text-[12px] text-dim truncate min-w-0 flex-1">{hint}</span>
      {actions && <div className="ml-auto shrink-0 flex items-center gap-2.5">{actions}</div>}
    </div>
  );
}
/* 线路选择：桌面居中弹窗，移动端底部抽屉 */
export default function LinePicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast, setUser } = useStore();
  const [state, setState] = useState<LineState | null>(null);
  const [mirrors, setMirrors] = useState<LineItem[] | null>(null);
  const [recommended, setRecommended] = useState<LineItem[] | null>(null);
  const [mirrorErr, setMirrorErr] = useState("");
  const [loadingMirrors, setLoadingMirrors] = useState(false);
  const [probes, setProbes] = useState<ProbeMap>({});
  const [probing, setProbing] = useState("");
  const [switching, setSwitching] = useState("");
  const [custom, setCustom] = useState("");
  const [customError, setCustomError] = useState("");
  const [stateError, setStateError] = useState("");
  const [ready, setReady] = useState(false);
  const stateRequest = useRef(0);
  const applying = useRef(false);

  const readState = (fillDraft = false) => {
    const request = ++stateRequest.current;
    setStateError("");
    if (fillDraft) setReady(false);
    api.lineState().then(next => {
      if (request !== stateRequest.current || applying.current) return;
      setState(next);
      setReady(true);
      if (fillDraft) setCustom(next.custom ? next.base : "");
    }).catch((e) => {
      if (request === stateRequest.current) {
        setReady(false);
        setStateError((e as Error).message || "서버 목록을 읽지 못했습니다");
      }
    });
  };

  const readMirrors = async () => {
    setLoadingMirrors(true);
    setMirrorErr("");
    try {
      const res = await api.lineMirrors();
      setMirrors(res?.items || []);
      setRecommended(res?.recommended || []);
    } catch (e) {
      setMirrors([]);
      setRecommended([]);
      setMirrorErr((e as Error).message || "미러 서버를 가져오지 못했습니다");
    } finally {
      setLoadingMirrors(false);
    }
  };

  /* 镜像线路只在用户点开「线路」后才去拉，拉过一次就留在内存里，可手动刷新 */
  useEffect(() => {
    if (!open) return;
    readState(true);
    setCustomError("");
    if (mirrors === null) void readMirrors();
    return () => { stateRequest.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const sync = () => readState();
    window.addEventListener("hg:line-changed", sync);
    return () => window.removeEventListener("hg:line-changed", sync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const probe = async (list: LineItem[], key: string) => {
    if (!list.length) return;
    setProbing(key);
    try {
      const res = await api.lineProbe(list.map((x) => x.url));
      setProbes((p) => {
        const next = { ...p };
        for (const r of res) next[r.url] = r;
        return next;
      });
    } catch (e) {
      toast((e as Error).message || "검사 실패", "info");
    } finally {
      setProbing("");
    }
  };

  const applyLine = async (key: string, apply: () => Promise<LineApply>) => {
    if (applying.current || !ready) return;
    const wasAuto = autoLineEnabled();
    applying.current = true;
    stateRequest.current++;
    setSwitching(key);
    setCustomError("");
    try {
      await setAutoLine(false);
      const next = await apply();
      tracePlayback("line.manual", { line: hostOf(next.base), prev: hostOf(state?.base ?? ""), custom: next.custom, ok: true });
      if (next.base !== state?.base) setUser(null);
      setState((s) => (s ? { ...s, ...next } : s));
      if (key === "custom" || key === "reset") setCustom(next.custom ? next.base : "");
      toast(`서버 변경: ${hostOf(next.base)}. 수동 선택이 적용되었습니다. 사이트가 달라지면 다시 로그인해 주세요`, "ok");
      // 走的是新域名了，列表页得重新拉一遍，否则还是旧线路的内容
      window.dispatchEvent(new Event("hg:line-changed"));
    } catch (e) {
      if (wasAuto) void setAutoLine(true);
      const error = (e as Error).message || "변경 실패";
      tracePlayback("line.manual", { ok: false, err: error });
      if (key === "custom" || key === "reset") setCustomError(error);
      else toast(error, "info");
    } finally {
      applying.current = false;
      setSwitching("");
    }
  };

  const pick = (url: string) => {
    if (state?.base === url) return;
    void applyLine(url, async () => ({ base: await api.lineSet(url), custom: false }));
  };
  const saveCustom = () => {
    const raw = custom.trim();
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) throw new Error();
    } catch {
      setCustomError("경로, 매개변수, 계정 정보 없이 HTTPS 사이트의 기본 주소를 입력해 주세요");
      return;
    }
    void applyLine("custom", () => api.lineCustomSet(raw));
  };

  const fixed = state?.fixed || [];
  const busyAll = !!probing || !!switching || !ready;
  const close = () => { if (!applying.current) onClose(); };

  const body = (
    <div className="flex flex-col min-h-0" style={{ maxHeight: isMobile ? "74vh" : "min(72vh, 620px)" }}>
      <div className="shrink-0 flex items-center gap-2 px-4 pt-3 pb-2">
        <span className="w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary"><ISettings size={16} /></span>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold text-on leading-tight">서버</div>
          <div className="text-[12px] text-mut mt-0.5 truncate">현재: {state ? hostOf(state.base) : "읽는 중…"}</div>
        </div>
        <Button onClick={close} disabled={!!switching} aria-label="닫기" className="min-w-12 min-h-12 rounded-full bg-s3/80 flex items-center justify-center text-mut pressable"><IClose size={16} /></Button>
      </div>

      <div className="flex-1 scroll-y px-3 pb-4">
        {stateError && <div role="alert" className="text-[13px] text-danger px-1">
          {stateError}<Button className="min-h-12 px-3 text-primary" onClick={() => readState(true)}>다시 읽기</Button>
        </div>}
        <GroupHead title="사용자 지정 미러" hint="저장하면 서버를 수동으로 선택합니다" />
        <Surface className="rounded-(--r-md) bg-s2 px-3.5 py-3">
          <form onSubmit={event => { event.preventDefault(); saveCustom(); }}>
            <label htmlFor="custom-line-address" className="block text-[14px] text-on mb-2">미러 주소</label>
            <Input id="custom-line-address" aria-label="미러 주소" value={custom} disabled={busyAll}
              className="min-h-12 w-full min-w-0 text-[14px]" type="url" inputMode="url" autoCapitalize="none" autoComplete="off" spellCheck={false}
              placeholder="https://mirror.example.com" aria-invalid={!!customError}
              aria-describedby={`custom-line-hint${customError ? " custom-line-error" : ""}`}
              onChange={event => { setCustom(event.target.value); setCustomError(""); }} />
            <p id="custom-line-hint" className="text-[12px] text-mut leading-relaxed mt-2">신뢰하는 HTTPS 사이트를 입력하세요. 로그인 요청이 해당 사이트로 전송되며 다른 사이트로 전환하면 다시 로그인해야 합니다.</p>
            {customError && <p id="custom-line-error" role="alert" className="text-[13px] text-danger break-words mt-2">{customError}</p>}
            <div className="flex gap-2 mt-3">
              <Button variant="secondary" disabled={busyAll} onClick={() => { void applyLine("reset", api.lineReset); }} className="min-h-12 px-3 flex-1">{switching === "reset" ? "복원 중…" : "기본 서버 복원"}</Button>
              <Button variant="primary" disabled={busyAll} type="submit" className="min-h-12 px-3 flex-1">{switching === "custom" ? "저장 중…" : "미러 저장"}</Button>
            </div>
          </form>
        </Surface>
        <GroupHead
          title="고정 서버"
          hint="프록시 또는 중국 본토 외 네트워크 필요"
          actions={
            <Button onClick={() => probe(fixed, "fixed")} disabled={busyAll || !fixed.length}
              className="text-[12px] text-primary pressable disabled:opacity-50">
              {probing === "fixed" ? "검사 중…" : "모두 검사"}
            </Button>
          }
        />
        <Surface className="rounded-(--r-md) bg-s2 divide-y divide-s3 overflow-hidden">
          {fixed.map((it) => (
            <Row key={it.url} item={it} current={state?.base === it.url} probe={probes[it.url]}
              busy={probing === it.url} disabled={busyAll} onPick={pick} onProbe={(u) => probe([{ url: u }], u)} />
          ))}
          {!fixed.length && <div className="px-3.5 py-3 text-[12px] text-mut">읽는 중…</div>}
        </Surface>

        <GroupHead
          title="추천 미러"
          hint="공식 주소 안내 페이지 제공 · 현재 서버를 맨 위에 표시"
          actions={
            recommended?.length ? (
              <Button onClick={() => probe(recommended, "recommended")} disabled={busyAll}
                className="text-[12px] text-primary pressable disabled:opacity-50">
                {probing === "recommended" ? "검사 중…" : `모두 검사 (${recommended.length})`}
              </Button>
            ) : undefined
          }
        />
        <Surface className="rounded-(--r-md) bg-s2 divide-y divide-s3 overflow-hidden">
          {loadingMirrors && <div className="flex justify-center py-6"><Loader className="w-6 h-6 spinner" /></div>}
          {!loadingMirrors && !recommended?.length && (
            <div className="px-3.5 py-3 text-[12px] text-mut">추천 페이지에 사용 가능한 미러 주소가 없습니다</div>
          )}
          {!loadingMirrors && (recommended || []).map((it) => (
            <Row key={it.url} item={it} current={state?.base === it.url} probe={probes[it.url]}
              busy={probing === it.url} disabled={busyAll} onPick={pick} onProbe={(u) => probe([{ url: u }], u)} />
          ))}
        </Surface>

        <GroupHead
          title="미러 서버"
          hint="일반적으로 직접 연결 가능"
          actions={
            <>
              <Button onClick={() => { void readMirrors(); }} disabled={loadingMirrors}
                className="inline-flex items-center gap-1 text-[12px] text-primary pressable disabled:opacity-50">
                <IRefresh size={12} />{loadingMirrors ? "가져오는 중…" : "새로고침"}
              </Button>
              {!!mirrors?.length && (
                <Button onClick={() => probe(mirrors, "mirrors")} disabled={busyAll}
                  className="text-[12px] text-primary pressable disabled:opacity-50">
                  {probing === "mirrors" ? "검사 중…" : `모두 검사 (${mirrors.length})`}
                </Button>
              )}
            </>
          }
        />
        <Surface className="rounded-(--r-md) bg-s2 divide-y divide-s3 overflow-hidden">
          {loadingMirrors && <div className="flex justify-center py-6"><Loader className="w-6 h-6 spinner" /></div>}
          {!loadingMirrors && mirrorErr && (
            <div className="px-3.5 py-3">
              <div className="text-[12px] text-danger">미러 서버를 가져오지 못했습니다</div>
              <div className="text-[12px] text-mut mt-1 break-all">{mirrorErr}</div>
            </div>
          )}
          {!loadingMirrors && !mirrorErr && mirrors?.length === 0 && (
            <div className="px-3.5 py-3 text-[12px] text-mut">주소 안내 페이지에 사용 가능한 미러 주소가 없습니다</div>
          )}
          {!loadingMirrors && (mirrors || []).map((it) => (
            <Row key={it.url} item={it} current={state?.base === it.url} probe={probes[it.url]}
              busy={probing === it.url} disabled={busyAll} onPick={pick} onProbe={(u) => probe([{ url: u }], u)} />
          ))}
        </Surface>

        <div className="text-[12px] text-dim leading-relaxed px-1 mt-4">
          변경 사항은 즉시 적용되며 요청 경로와 데이터 모델은 유지됩니다. 여기서 실행하는 검사는 일회성이며,
          자동 서버 선택은 설정 → 네트워크 → 서버 자동 선택에서 관리할 수 있습니다.
        </div>
      </div>
    </div>
  );

  return isMobile
    ? <Sheet open={open} onClose={close} label="재생 서버 선택">{body}</Sheet>
    : <Modal open={open} onClose={close} label="재생 서버 선택" width={460}>{body}</Modal>;
}
