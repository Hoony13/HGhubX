import { isLinux } from "./api";

export function mediaErrorMessage(error: MediaError | null): string {
  switch (error?.code) {
    case 2:
      return "네트워크 오류로 영상을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요";
    case 3:
      return "영상 디코딩에 실패했습니다. 다시 시도해 주세요";
    case 4:
      return isLinux
        ? "H.264/AAC 디코더가 없습니다. gstreamer1.0-libav와 gstreamer1.0-plugins-bad를 설치한 뒤 다시 시도해 주세요"
        : "지원하지 않는 영상 형식입니다";
    default:
      return "영상을 불러오지 못했습니다. 다시 시도해 주세요";
  }
}
