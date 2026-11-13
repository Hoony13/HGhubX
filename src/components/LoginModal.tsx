import { useId, useState } from "react";
import { api, isMobile } from "../api";
import type { User } from "../types";
import { useStore } from "../store";
import { Modal, Sheet } from "./ui";
import { Button, Form, Input, SegmentedControl } from "./ios/controls";
import { Loader } from "./ios/effects";
import { IClose, ILogin } from "../icons";

export default function LoginModal() {
  const { loginOpen, setLoginOpen, setUser, toast } = useStore();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const errorId = useId();
  const title = mode === "login" ? "HGhubX 로그인" : "HGhubX 회원가입";
  const submit = async () => {
    if (busy) return;
    if (!username.trim() || !password) { setErr("아이디와 비밀번호를 입력해 주세요"); return; }
    setBusy(true); setErr("");
    try {
      const result = mode === "login" ? await api.login(username.trim(), password) : await api.register(username.trim(), password, email.trim());
      setUser(result.user as User); setPassword(""); setLoginOpen(false);
      toast(mode === "login" ? `다시 오신 것을 환영합니다, ${result.user?.nickname || username}` : "가입이 완료되었습니다", "ok");
    } catch (error) { setErr((error as Error).message || "작업 실패"); }
    finally { setBusy(false); }
  };
  const content = <div className="ios-auth">
    <div className="ios-dialog-heading"><span className="ios-heading-icon"><ILogin size={21} /></span><h2>{title}</h2>
      <Button className="ios-icon-button" aria-label="로그인 닫기" onClick={() => setLoginOpen(false)}><IClose size={19} /></Button>
    </div>
    <p className="ios-description">로그인하면 소통에 참여할 수 있습니다. 즐겨찾기와 시청 기록은 로그인 없이도 기기에 저장됩니다.</p>
    <SegmentedControl className="ios-auth-tabs" aria-label="계정 메뉴" activeIndex={mode === "login" ? 0 : 1}>
      {([ ["login", "로그인"], ["register", "회원가입"] ] as const).map(([key, label]) => <Button key={key}
        aria-pressed={mode === key} onClick={() => { setMode(key); setErr(""); }}>{label}</Button>)}
    </SegmentedControl>
    <Form className="ios-auth-form" aria-busy={busy} onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label className="ios-field"><span>아이디</span><Input aria-label="아이디" data-autofocus autoComplete="username" name="username" placeholder="아이디 입력" value={username}
        onChange={event => setUsername(event.target.value)} aria-invalid={!!err} aria-describedby={err ? errorId : undefined} /></label>
      <label className="ios-field"><span>비밀번호</span><Input aria-label="비밀번호" autoComplete={mode === "login" ? "current-password" : "new-password"} name="password" type="password"
        placeholder="비밀번호 입력" value={password} onChange={event => setPassword(event.target.value)} aria-invalid={!!err} aria-describedby={err ? errorId : undefined} /></label>
      {mode === "register" && <label className="ios-field"><span>이메일 <small>선택 사항</small></span><Input aria-label="이메일" type="email" autoComplete="email" name="email"
        placeholder="계정 관련 연락용" value={email} onChange={event => setEmail(event.target.value)} /></label>}
      {err && <p id={errorId} role="alert" className="ios-field-error">{err}</p>}
      <Button variant="primary" className="ios-auth-submit" type="submit" disabled={busy}>
        {busy && <Loader className="size-5" />}{busy ? "처리 중…" : mode === "login" ? "로그인" : "계정 만들기"}
      </Button>
    </Form>
    <p className="ios-description ios-auth-note">로그인은 현재 사이트에만 적용됩니다. 사용자 지정 미러를 사용하면 입력한 사이트로 로그인 요청이 전송되며, 사이트가 달라지면 다시 로그인해야 합니다.</p>
  </div>;
  return isMobile ? <Sheet open={loginOpen} onClose={() => setLoginOpen(false)} label={title}>{content}</Sheet>
    : <Modal open={loginOpen} onClose={() => setLoginOpen(false)} label={title} width={440}>{content}</Modal>;
}
