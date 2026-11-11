import type { SignInErrorCode } from "@/types/auth";

/** Korean copy for S01 errors. invalid_password text is from wireframe pages 3–4. */
export const SIGN_IN_MESSAGES: Record<SignInErrorCode, string> = {
  invalid_password: "비밀번호가 올바르지 않습니다.",
  not_configured: "로그인 설정이 아직 완료되지 않았습니다. 관리자 설정을 확인해 주세요.",
  rate_limited: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  unavailable: "지금은 로그인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
};
