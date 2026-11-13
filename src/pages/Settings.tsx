import { Button, SegmentedControl, Surface, TextArea } from "../components/ios/controls";
import { useEffect, useState, type ReactNode } from "react";
import { api, APP_VERSION, hostOf, logLine, platform, type UpdateInfo } from "../api";
import { useStore } from "../store";
import { Modal, Toggle } from "../components/ui";
import LinePicker from "../components/LinePicker";
import ProxySettings from "../components/ProxySettings";
import { autoLineEnabled, setAutoLine } from "../autoLine";
import { copyPlaybackLog, initPlaybackLog, setPlaybackLog, tracePlayback, usePlaybackLog } from "../playbackDiagnostics";
import { formatNetDiag, shortVerdict } from "../netDiagReport";
import { copyText } from "../clipboard";
import { IBack, IBoltF, IBroom, IChevR, IHeart, IInfo, ILink, ILockF, IMoon, IRefresh, ISun, IVolMute } from "../icons";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <>
    <div className="ios-section-label">{title}</div>
    <Surface className="ios-setting-group">{children}</Surface>
  </>;
}

/* 独立设置页：线路 / 外观 / 播放 / 本地数据 / 清理缓存 / 网络诊断 / 关于
   入口：Windows 侧栏「设置」、Android「我的」右上角齿轮 */
export default function Settings({ onBack, wide }: { onBack: () => void; wide: boolean }) {
  const { theme, themePreference, setTheme, favs, history, muteOnStartup, setMuteOnStartup, preferHevc, setPreferHevc, strictSecurity, strictSecurityReady, securityPending, cliRelaxed, setStrictSecurity, toast } = useStore();
  const [about, setAbout] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [lineOpen, setLineOpen] = useState(false);
  const [lineBase, setLineBase] = useState("");
  const [autoLineOn, setAutoLineOn] = useState(autoLineEnabled);
  const [clearing, setClearing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  /** 应用内更新进行到哪一步（空串=没在更新） */
  const [updating, setUpdating] = useState("");
  const playbackLog = usePlaybackLog();
  const [copyingLog, setCopyingLog] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagReport, setDiagReport] = useState<string | null>(null);
  const [copyingReport, setCopyingReport] = useState(false);

  useEffect(() => { void initPlaybackLog(); }, []);

  const readLine = () => { api.lineState().then((state) => setLineBase(state.base)).catch(() => {}); };
  useEffect(() => {
    const sync = () => { readLine(); setAutoLineOn(autoLineEnabled()); };
    sync();
    window.addEventListener("hg:line-changed", sync);
    window.addEventListener("hg:auto-line-changed", sync);
    return () => {
      window.removeEventListener("hg:line-changed", sync);
      window.removeEventListener("hg:auto-line-changed", sync);
    };
  }, []);

  const checkUpdate = async () => {
    setChecking(true);
    try {
      const info = await api.checkUpdate();
      if (info.has_update) setUpdate(info);
      else toast(`최신 버전입니다: v${info.current}`, "ok");
    } catch (e) {
      toast((e as Error).message || "업데이트 확인 실패", "info");
    } finally {
      setChecking(false);
    }
  };
  /** 更新：用系统浏览器打开下载页，由系统/浏览器完成下载与安装。
   *
   * 不再自己下载 APK 并调安装器 —— 那条路在安卓上要额外过 FileProvider
   * 与「安装未知应用」授权，失败点多，体验并不比浏览器好。
   */
  const doUpdate = async () => {
    if (!update) return;
    setUpdating("여는 중…");
    try {
      await api.openUrl(update.url);
    } catch (e) {
      await copyText(update.url)
        .then(() => toast("다운로드 주소를 복사했습니다. 브라우저에 붙여 넣어 열어 주세요", "ok"))
        .catch(() => toast((e as Error).message || "열기 실패", "info"));
    } finally {
      setUpdating("");
    }
  };

  return (
    <div className="ios-page absolute inset-0 bg-bg flex flex-col">
      <div className="shrink-0 pt-3 pb-4" style={{ paddingTop: "calc(var(--sat, 0px) + 12px)" }}>
        <Button onClick={onBack} aria-label="뒤로" className="ios-icon-button mb-3"><IBack size={20} /></Button>
        <h1 className="ios-page-title text-on">설정</h1>
        <p className="text-[13px] text-mut mt-2">나에게 맞게 HGhubX 설정하기</p>
      </div>

      <div className="ios-page-body flex-1 scroll-y px-4 pt-1 pb-10">
        <div className={wide ? "max-w-[720px] mx-auto" : ""}>
          <Section title="테마">
            <div className="ios-appearance-row items-center">
              <span className="ios-setting-icon">{themePreference === "system" ? <IRefresh size={16} /> : theme === "dark" ? <IMoon size={16} /> : <ISun size={16} />}</span>
              <div className="flex-1">
                <div className="text-[14px] text-on">테마</div>
                <div className="text-[12px] text-mut">{themePreference === "system" ? `시스템 설정 사용 (현재: ${theme === "dark" ? "다크" : "라이트"})` : theme === "dark" ? "다크 테마" : "라이트 테마"}</div>
              </div>
              <SegmentedControl className="ios-appearance-picker" aria-label="테마 모드" activeIndex={(["system", "light", "dark"] as const).indexOf(themePreference)}>
                {([['system', "자동"], ['light', "라이트"], ['dark', "다크"]] as const).map(([value, label]) => (
                  <Button key={value} type="button" aria-pressed={themePreference === value}
                    onClick={() => setTheme(value)}>
                    {label}
                  </Button>
                ))}
              </SegmentedControl>
            </div>
          </Section>

          <Section title="재생">
            <div className="flex items-center gap-3 px-3.5 py-3">
              <span className="ios-setting-icon"><IVolMute size={16} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] text-on">시작 시 음소거</div>
                <div className="text-[12px] text-mut">기본으로 켜져 있어 앱을 시작할 때마다 음소거합니다. 끄면 이전 음소거 상태를 기억합니다. 다음 실행부터 적용됩니다.</div>
              </div>
              <Toggle on={muteOnStartup} onChange={setMuteOnStartup} label="시작 시 음소거" />
            </div>
            <div className="flex items-center gap-3 px-3.5 py-3">
              <span className="ios-setting-icon"><IBoltF size={16} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] text-on">고화질 우선</div>
                <div className="text-[12px] text-mut">고화질이 있으면 HEVC를 사용하며 재생할 수 없으면 일반 화질로 전환합니다</div>
              </div>
              <Toggle on={preferHevc} onChange={setPreferHevc} label="고화질 우선" />
            </div>
          </Section>

          <Section title="기기 데이터">
            <div className="flex items-center gap-3 px-3.5 py-3">
              <span className="ios-setting-icon"><IHeart size={16} /></span>
              <div className="flex-1">
                <div className="text-[14px] text-on">내 라이브러리</div>
                <div className="text-[12px] text-mut">{favs.length}편 즐겨찾기 · {history.length}개 시청 기록</div>
              </div>
            </div>
            <Button onClick={() => setClearOpen(true)} className="w-full flex items-center gap-3 px-3.5 py-3 text-left pressable">
              <span className="ios-setting-icon"><IBroom size={16} /></span>
              <div className="flex-1">
                <div className="text-[14px] text-on">캐시 삭제</div>
                <div className="text-[12px] text-mut">표지 및 재생 캐시와 기기 기록</div>
              </div>
              <IChevR size={15} className="text-mut" />
            </Button>
          </Section>

          <Section title="네트워크">
            <ProxySettings />
            <Button onClick={() => setLineOpen(true)} className="w-full flex items-center gap-3 px-3.5 py-3 text-left pressable">
              <span className="ios-setting-icon"><IBoltF size={16} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] text-on">재생 서버</div>
                <div className="text-[12px] text-mut truncate">{lineBase ? hostOf(lineBase) : "읽는 중…"}</div>
              </div>
              <IChevR size={15} className="text-mut" />
            </Button>
            <div className="flex items-center gap-3 px-3.5 py-3">
              <span className="ios-setting-icon"><IRefresh size={15} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] text-on">서버 자동 선택</div>
                <div className="text-[12px] text-mut">기본 서버를 사용할 수 없으면 공개된 미러를 검사합니다. 끄면 수동 선택을 유지합니다</div>
              </div>
              <Toggle label="서버 자동 선택" on={autoLineOn} onChange={(on) => {
                void setAutoLine(on).catch(() => toast("서버 자동 선택을 중지하지 못했습니다. 다시 시도해 주세요", "info"));
                setAutoLineOn(on);
                toast(on ? "서버 자동 선택을 켰습니다" : "서버 자동 선택을 껐습니다. 재생 서버를 직접 선택할 수 있습니다", "info");
              }} />
            </div>
            <div className="flex items-center gap-3 px-3.5 py-3">
              <span className="ios-setting-icon"><ILockF size={15} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] text-on">강화 보안 모드</div>
                <div className="text-[12px] text-mut">
                  {cliRelaxed
                    ? "실행 옵션 --no-strict로 호환 모드가 적용되었습니다. 직접 다시 켤 수 있습니다"
                    : "기본으로 켜져 있어 악성 콘텐츠와 내부망 탐색을 차단합니다. 본문이나 프록시에 문제가 생기면 끄거나 --no-strict로 실행하세요"}
                </div>
              </div>
              <Toggle
                on={strictSecurity}
                disabled={!strictSecurityReady || securityPending}
                onChange={(on) => {
                  void setStrictSecurity(on).then(() => {
                    toast(on ? "강화 보안 모드를 켰습니다" : "호환 모드로 전환했습니다 (엄격한 콘텐츠 필터링 및 보호 해제)", "info");
                  }).catch(() => toast("보안 설정을 저장하지 못해 기존 모드를 유지합니다", "info"));
                }}
                label="강화 보안 모드"
              />
            </div>
            {/* 打不开时先点这里：把 DNS / 代理 / HTTP 结果复制给维护者 */}
            <Button disabled={diagnosing} onClick={async () => {
              setDiagnosing(true);
              try {
                const diag = await api.netDiag();
                // 落盘走原始 JSON（便于脚本统计），复制给对方的是分段可读报告。
                logLine(`[net_diag] ${JSON.stringify(diag)}`);
                const http = (diag.http ?? {}) as { ms?: number; status?: number };
                const dns = (diag.dns ?? {}) as { count?: number; has_fake_ip?: boolean };
                const env = (diag.env ?? {}) as Record<string, unknown>;
                tracePlayback("net.diag", {
                  verdict: String(diag.verdict ?? ""),
                  host: hostOf(String(diag.host ?? "")), http_status: http.status ?? null, http_ms: http.ms ?? null,
                  dns_count: dns.count ?? null, fake_ip: dns.has_fake_ip ?? null,
                  proxy: Object.values(env).some(Boolean), strict: strictSecurity,
                });
                const report = formatNetDiag(diag);
                try {
                  await copyText(report);
                  toast(`진단 결과 복사 완료 · ${shortVerdict(diag)}`, "ok");
                } catch {
                  setDiagReport(report);
                  toast("진단을 완료했지만 복사하지 못했습니다. 보고서에서 다시 시도해 주세요", "info");
                }
              } catch (e) {
                const detail = e instanceof Error ? e.message : typeof e === "string" ? e : "잠시 후 다시 시도해 주세요";
                toast(`네트워크 진단 실패: ${detail}`, "info");
              } finally {
                setDiagnosing(false);
              }
            }} className="w-full flex items-center gap-3 px-3.5 py-3 text-left pressable disabled:opacity-60">
              <span className="ios-setting-icon"><ILink size={16} /></span>
              <div className="flex-1">
                <div className="text-[14px] text-on">{diagnosing ? "진단 중…" : "네트워크 진단"}</div>
                <div className="text-[12px] text-mut">DNS, TCP, 시스템 프록시 및 사이트 연결을 진단하고 결과 보고서를 복사합니다</div>
              </div>
              <IChevR size={15} className="text-mut" />
            </Button>
          </Section>

          <Section title="재생 진단">
            <div className="flex items-center gap-3 px-3.5 py-3">
              <span className="ios-setting-icon"><IInfo size={16} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] text-on">재생 진단 로그</div>
                <div className="text-[12px] text-mut">버전, 플랫폼, 현재 서버 및 재생 실패 원인은 항상 기록합니다. 켜면 탐색과 버퍼링 세부 정보도 기록합니다</div>
                {playbackLog.error && <div role="alert" className="text-[12px] text-danger">{playbackLog.error}</div>}
              </div>
              <Toggle label="재생 진단 로그" on={playbackLog.enabled} disabled={!playbackLog.ready || playbackLog.pending}
                onChange={(on) => { void setPlaybackLog(on).then(() => toast(on ? "재생 진단을 켰습니다. 문제를 재현해 주세요" : "재생 진단을 껐습니다. 기존 로그는 유지됩니다", "ok")).catch(() => toast("로그 설정을 저장하지 못했습니다. 다시 시도해 주세요", "info")); }} />
            </div>
            <Button disabled={!playbackLog.ready || playbackLog.pending || copyingLog} onClick={async () => {
              setCopyingLog(true);
              try { await copyPlaybackLog(); toast("재생 진단 로그를 복사했습니다", "ok"); }
              catch (e) { toast((e as Error).message || "로그 복사 실패", "info"); }
              finally { setCopyingLog(false); }
            }} className="w-full flex items-center gap-3 px-3.5 py-3 text-left pressable disabled:opacity-60">
              <span className="ios-setting-icon"><ILink size={16} /></span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] text-on">{copyingLog ? "복사 중…" : "재생 진단 로그 복사"}</div>
                <div className="text-[12px] text-mut break-all">버전, 플랫폼, 현재 서버 및 재생 실패 원인을 포함한 전체 로그를 복사합니다{playbackLog.path ? ` · ${playbackLog.path}` : ""}</div>
              </div>
              <IChevR size={15} className="text-mut" />
            </Button>
          </Section>

          <Section title="기타">
            <Button onClick={checkUpdate} disabled={checking} className="w-full flex items-center gap-3 px-3.5 py-3 text-left pressable disabled:opacity-60">
              <span className="ios-setting-icon"><IRefresh size={16} /></span>
              <div className="flex-1">
                <div className="text-[14px] text-on">업데이트 확인</div>
                <div className="text-[12px] text-mut">{checking ? "확인 중…" : `현재 v${APP_VERSION} · GitHub 릴리스와 비교`}</div>
              </div>
              <IChevR size={15} className="text-mut" />
            </Button>
            <Button onClick={() => setAbout(true)} className="w-full flex items-center gap-3 px-3.5 py-3 text-left pressable">
              <span className="ios-setting-icon"><IInfo size={16} /></span>
              <div className="flex-1">
                <div className="text-[14px] text-on">HGhubX 정보</div>
                <div className="text-[12px] text-mut">버전 {APP_VERSION} · 비상업적 용도로만 사용 가능</div>
              </div>
              <IChevR size={15} className="text-mut" />
            </Button>
          </Section>

          <div className="text-center text-[12px] text-dim mt-5">HGhubX {APP_VERSION} · {platform === "android" ? "Android" : platform === "ios" ? "iOS" : platform === "macos" ? "macOS" : platform === "linux" ? "Linux" : "Windows"} 클라이언트</div>
        </div>
      </div>

      <LinePicker open={lineOpen} onClose={() => { setLineOpen(false); readLine(); }} />

      <Modal open={diagReport !== null} onClose={() => setDiagReport(null)} width={520}>
        <div className="p-5">
          <h2 className="text-[15px] font-bold text-on">네트워크 진단 보고서</h2>
          <p className="text-[13px] text-mut mt-2">진단은 완료했지만 자동 복사에 실패했습니다. 다시 복사하거나 아래 보고서의 텍스트를 선택해 주세요.</p>
          <TextArea readOnly aria-label="네트워크 진단 보고서" value={diagReport ?? ""}
            className="w-full h-64 mt-3 p-3 rounded-(--r-sm) bg-s3 text-[12px] text-on resize-none" />
          <div className="flex gap-2 mt-4">
            <Button onClick={() => setDiagReport(null)} className="flex-1 h-9 rounded-(--r-ctl) bg-s3 text-[14px] text-on pressable">닫기</Button>
            <Button disabled={copyingReport} onClick={async () => {
              if (diagReport === null) return;
              setCopyingReport(true);
              try { await copyText(diagReport); toast("네트워크 진단 보고서를 복사했습니다", "ok"); setDiagReport(null); }
              catch { toast("복사하지 못했습니다. 보고서 텍스트를 선택해 직접 복사해 주세요", "info"); }
              finally { setCopyingReport(false); }
            }} className="flex-1 h-9 rounded-(--r-ctl) brand-grad text-[14px] pressable disabled:opacity-60">{copyingReport ? "복사 중…" : "보고서 복사"}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={about} onClose={() => setAbout(false)} width={392}>
        <div className="p-5">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-(--r-sm) brand-grad glow-neon flex items-center justify-center text-on-primary text-[17px] font-black">H</span>
            <div>
              <div className="text-[16px] font-bold text-on leading-tight">HGhubX</div>
              <div className="text-[12px] text-mut mt-0.5">HGhubX 클라이언트 v{APP_VERSION}</div>
            </div>
          </div>

          <p className="text-[13px] text-on/70 leading-relaxed mt-4">
            Rust + Tauri 2로 제작한 크로스플랫폼 클라이언트로 Windows, macOS, Linux, Android 및 iOS를 지원합니다.
            iOS 스타일의 둥근 모서리와 유리 효과를 적용했으며 몰입형 세로 영상 피드를 제공합니다.
          </p>

          <Surface className="mt-4 rounded-(--r-sm) bg-s3/60 p-3 text-[12px] text-mut leading-relaxed">
            이 프로젝트는 학습 및 교류를 위한 것입니다. 모든 콘텐츠는 외부 사이트에서 제공하며 클라이언트는 영상을 저장하거나 배포하지 않습니다.
            관련 자료는 24시간 이내에 삭제하고 정식 콘텐츠를 이용해 주세요.
          </Surface>

          <div className="mt-4 divide-y divide-s3">
            <Button onClick={() => { api.openUrl("https://github.com/zxsos/HGhubX").catch(() => { copyText("https://github.com/zxsos/HGhubX").then(() => toast("저장소 주소를 복사했습니다", "ok")).catch(() => {}); }); }}
              className="w-full flex items-center gap-2 py-2.5 text-left pressable">
              <ILink size={15} className="text-mut" />
              <span className="text-[13px] text-on/85">github.com/zxsos/HGhubX</span>
              <span className="ml-auto text-[12px] text-primary">복사</span>
            </Button>
            <Button onClick={() => { copyText("https://huangguoai.com").then(() => toast("사이트 주소를 복사했습니다", "ok")).catch(() => {}); }}
              className="w-full flex items-center gap-2 py-2.5 text-left pressable">
              <ILink size={15} className="text-mut" />
              <span className="text-[13px] text-on/85">huangguoai.com</span>
              <span className="ml-auto text-[12px] text-primary">복사</span>
            </Button>
            <div className="flex items-center gap-2 py-2.5">
              <IInfo size={15} className="text-mut" />
              <span className="text-[13px] text-on/85">PolyForm Noncommercial 1.0.0</span>
              <span className="ml-auto text-[12px] text-mut">비상업적 용도 전용</span>
            </div>
          </div>

          <Button onClick={() => setAbout(false)} className="mt-4 w-full h-9 rounded-(--r-ctl) bg-s3 text-[14px] text-on pressable">확인</Button>
        </div>
      </Modal>

      <Modal open={clearOpen} onClose={() => setClearOpen(false)} width={330}>
        <div className="p-5">
          <div className="text-[15px] font-bold text-on">캐시 삭제</div>
          <p className="text-[13px] text-mut leading-relaxed mt-2">
            표지와 재생 목록 캐시 (복호화 이미지 / m3u8)만 삭제합니다. 즐겨찾기, 시청 기록, 검색 기록 및 로그인 상태는 유지됩니다.
          </p>
          <div className="flex gap-2 mt-5">
            <Button onClick={() => setClearOpen(false)} className="flex-1 h-9 rounded-(--r-ctl) bg-s3 text-[14px] text-on/80 pressable">취소</Button>
            <Button disabled={clearing} onClick={async () => {
              setClearing(true);
              try { await api.clearCache(); } catch { /* 忽略 */ }
              setClearing(false);
              setClearOpen(false);
              toast("캐시를 삭제했습니다", "ok");
            }} className="flex-1 h-9 rounded-(--r-ctl) bg-primary text-[14px] font-semibold text-on-primary pressable disabled:opacity-60">
              {clearing ? "삭제 중…" : "삭제 확인"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!update?.has_update} onClose={() => setUpdate(null)} width={392}>
        <div className="p-5">
          <div className="text-[16px] font-bold text-on">새 버전이 있습니다</div>
          <p className="text-[12px] text-mut mt-1.5">
            v{update?.current} → <b className="text-on">v{update?.latest}</b>
            {update?.published_at ? ` · ${update.published_at.slice(0, 10)}` : ""}
          </p>
          {!!update?.notes && (
            <Surface className="mt-3 max-h-[180px] scroll-y rounded-(--r-sm) bg-s2 p-3 text-[12px] text-mut whitespace-pre-wrap leading-relaxed">{update.notes}</Surface>
          )}
          <div className="flex gap-2 mt-4">
            <Button onClick={() => setUpdate(null)} disabled={!!updating}
              className="flex-1 h-9 rounded-(--r-ctl) bg-s3 text-[14px] text-on/80 pressable disabled:opacity-60">나중에</Button>
            <Button onClick={() => void doUpdate()} disabled={!!updating}
              className="flex-1 h-9 rounded-(--r-ctl) bg-primary text-[14px] font-semibold text-on-primary pressable disabled:opacity-60">
              {updating || "다운로드 페이지 열기"}
            </Button>
          </div>
          <div className="text-[12px] text-dim mt-2.5 break-all">{update?.url}</div>
        </div>
      </Modal>
    </div>
  );
}
