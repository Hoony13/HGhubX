import { Button, Surface } from "../components/ios/controls";
import { Loader } from "../components/ios/effects";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, fmt } from "../api";
import type { UserProfile, VideoCard } from "../types";
import { useStore } from "../store";
import { Masonry } from "../components/cards";
import { InplaceSearch } from "../components/InplaceSearch";
import { Avatar, Empty } from "../components/ui";
import { IBack, IGrid, ISearch, IUser } from "../icons";

/* ================= 关注流 ================= */
export function FollowingPage({ onBack, wide }: { onBack: () => void; wide: boolean }) {
  const { push, user, setLoginOpen, toast } = useStore();
  const [searching, setSearching] = useState(false);
  const [items, setItems] = useState<VideoCard[]>([]);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const busy = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (busy.current || page >= pages) return;
    busy.current = true;
    setLoading(true);
    try {
      const next = page + 1;
      const res = await api.following(next, 20);
      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...(res?.items || []).filter((x) => !seen.has(x.id))];
      });
      setPage(next);
      setPages(res?.pagination?.pages || next);
      setErr("");
    } catch (e) {
      setErr((e as Error).message || "불러오기 실패");
      toast((e as Error).message || "불러오기 실패", "info");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [page, pages, toast]);

  useEffect(() => {
    if (!user) return;
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) loadMore(); }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pages]);

  return (
    <div className="ios-page absolute inset-0 bg-bg flex flex-col">
      <div className="shrink-0 bg-s1" style={{ paddingTop: "var(--sat, 0px)" }}>
        <div className="px-3 pt-2 pb-3 flex items-center gap-2.5">
          <Button aria-label="뒤로" onClick={onBack} className="w-10 h-10 rounded-full flex items-center justify-center text-on hover:bg-s3 pressable"><IBack size={20} /></Button>
          <span className="text-[17px] font-bold text-on">팔로우</span>
          <span className="text-[12px] text-mut">{items.length}편</span>
          <Button onClick={() => setSearching(true)} aria-label="숏드라마 검색" className="ml-auto w-9 h-9 rounded-full flex items-center justify-center text-on hover:bg-s3 pressable"><ISearch size={19} /></Button>
        </div>
      </div>

      <div className="flex-1 scroll-y px-4 pt-3 pb-8">
        {!user ? (
          <Empty icon={<IUser size={26} />} title="로그인하고 팔로우 피드 보기" sub="좋아하는 작성자를 팔로우하고 새 작품을 가장 먼저 만나 보세요"
            action="로그인하기" onAction={() => setLoginOpen(true)} />
        ) : loading && !items.length ? (
          <div className="flex justify-center py-12"><Loader className="w-8 h-8 spinner" /></div>
        ) : err && !items.length ? (
          <Empty icon={<IGrid size={26} />} title="불러오기 실패" sub={err} action="다시 시도" onAction={loadMore} />
        ) : items.length ? (
          <Masonry videos={items} wide={wide} onOpen={(v) => push({ kind: "feed", videoIds: items.map((x) => x.id), index: items.findIndex((x) => x.id === v.id), title: "팔로우" })} />
        ) : (
          <Empty icon={<IGrid size={26} />} title="팔로우한 콘텐츠가 없습니다" sub="작성자를 팔로우하면 새 소식을 여기에서 모아 볼 수 있습니다" />
        )}
        <div ref={sentinel} className="h-8" />
        {loading && items.length > 0 && <div className="flex justify-center py-3"><Loader className="w-6 h-6 spinner" /></div>}
        {!loading && items.length > 0 && page >= pages && <div className="text-center text-[12px] text-dim py-3">— 마지막 콘텐츠입니다 —</div>}
      </div>
      {searching && <InplaceSearch kind="video" wide={wide} onClose={() => setSearching(false)} onOpenVideo={(v, list) => push({ kind: "feed", videoIds: list.map((x) => x.id), index: list.findIndex((x) => x.id === v.id), title: "팔로우" })} />}
    </div>
  );
}

/* ================= 用户主页 ================= */
export function UserPage({ id, name, onBack, wide }: { id: number; name?: string; onBack: () => void; wide: boolean }) {
  const { push, toast, follows, toggleFollowLocal, user, setLoginOpen } = useStore();
  const [searching, setSearching] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<{ followers?: number; video_count?: number; post_count?: number; like_count?: number }>({});
  const [items, setItems] = useState<VideoCard[]>([]);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const busy = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    api.user(id).then((u) => { if (alive) setProfile(u); }).catch(() => {});
    api.userStats(id).then((s) => { if (alive) setStats(s); }).catch(() => {});
    return () => { alive = false; };
  }, [id]);

  const loadMore = useCallback(async () => {
    if (busy.current || page >= pages) return;
    busy.current = true;
    setLoading(true);
    try {
      const next = page + 1;
      const res = await api.userVideos(id, next, 20);
      setItems((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        return [...prev, ...(res?.items || []).filter((x) => !seen.has(x.id))];
      });
      setPage(next);
      setPages(res?.pagination?.pages || next);
      setErr("");
    } catch (e) {
      setErr((e as Error).message || "불러오기 실패");
      toast((e as Error).message || "불러오기 실패", "info");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [id, page, pages, toast]);

  useEffect(() => { loadMore(); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) loadMore(); }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pages]);

  const following = follows.includes(id);
  const onFollow = () => {
    const on = toggleFollowLocal(id);
    toast(on ? `팔로우: ${profile?.nickname || name || ""}` : "팔로우를 취소했습니다", on ? "ok" : "info");
    if (!user) { setLoginOpen(true); return; }
    api.follow(id, on).catch(() => {});
  };

  return (
    <div className="ios-page absolute inset-0 bg-bg flex flex-col">
      <div className="shrink-0 bg-s1" style={{ paddingTop: "var(--sat, 0px)" }}>
        <div className="px-3 pt-2 pb-3 flex items-center gap-2.5">
          <Button aria-label="뒤로" onClick={onBack} className="w-10 h-10 rounded-full flex items-center justify-center text-on hover:bg-s3 pressable"><IBack size={20} /></Button>
          <span className="text-[16px] font-bold text-on truncate">{profile?.nickname || name || "사용자 프로필"}</span>
          <Button onClick={() => setSearching(true)} aria-label="숏드라마 검색" className="ml-auto w-9 h-9 rounded-full flex items-center justify-center text-on hover:bg-s3 pressable"><ISearch size={19} /></Button>
        </div>
      </div>

      <div className="flex-1 scroll-y px-4 pt-3 pb-8">
        {/* 资料卡 */}
        <Surface className="rounded-(--r-lg) bg-s1 p-4 elev-1 flex items-center gap-3.5 a-rise">
          <Avatar size={56} name={profile?.nickname || name || "U"} hue={220} ring />
          <div className="flex-1 min-w-0">
            <div className="text-[16px] font-bold text-on truncate">{profile?.nickname || name || "알 수 없는 사용자"}</div>
            {profile?.username && <div className="text-[12px] text-mut mt-0.5">@{profile.username} · ID {id}</div>}
            <div className="flex gap-3 mt-2 text-[12px] text-mut">
              <span>작품 <b className="text-on">{fmt(stats.video_count)}</b></span>
              <span>팔로워 <b className="text-on">{fmt(stats.followers)}</b></span>
              <span>받은 좋아요 <b className="text-on">{fmt(stats.like_count)}</b></span>
            </div>
          </div>
          <Button onClick={onFollow}
            className={`h-8 px-3.5 rounded-full text-[12px] font-semibold pressable shrink-0 ${following ? "bg-s3 text-mut" : "bg-primary text-on-primary"}`}>
            {following ? "팔로잉" : "+ 팔로우"}
          </Button>
        </Surface>

        {profile?.sign && <div className="mt-3 text-[13px] text-mut leading-relaxed">{profile.sign}</div>}

        <div className="mt-4 mb-2.5 text-[14px] font-bold text-on">작품 {items.length ? `(${items.length})` : ""}</div>

        {loading && !items.length ? (
          <div className="flex justify-center py-12"><Loader className="w-8 h-8 spinner" /></div>
        ) : err && !items.length ? (
          <Empty icon={<IGrid size={26} />} title="불러오기 실패" sub={err} action="다시 시도" onAction={loadMore} />
        ) : items.length ? (
          <Masonry videos={items} wide={wide} onOpen={(v) => push({ kind: "feed", videoIds: items.map((x) => x.id), index: items.findIndex((x) => x.id === v.id), title: profile?.nickname || name || "사용자 작품" })} />
        ) : (
          <Empty icon={<IGrid size={26} />} title="작품이 없습니다" />
        )}
        <div ref={sentinel} className="h-8" />
        {loading && items.length > 0 && <div className="flex justify-center py-3"><Loader className="w-6 h-6 spinner" /></div>}
        {!loading && items.length > 0 && page >= pages && <div className="text-center text-[12px] text-dim py-3">— 마지막 콘텐츠입니다 —</div>}
      </div>
      {searching && <InplaceSearch kind="video" wide={wide} onClose={() => setSearching(false)} onOpenVideo={(v, list) => push({ kind: "feed", videoIds: list.map((x) => x.id), index: list.findIndex((x) => x.id === v.id), title: profile?.nickname || name || "사용자 작품" })} />}
    </div>
  );
}