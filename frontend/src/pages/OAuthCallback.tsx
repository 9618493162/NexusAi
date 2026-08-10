import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/auth.store";
import { PageLoader } from "@/components/PageLoader";

export function OAuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuth } = useAuthStore();

  useEffect(() => {
    const accessToken = searchParams.get("accessToken");
    const refreshToken = searchParams.get("refreshToken");
    if (accessToken && refreshToken) {
      fetch(`${import.meta.env.VITE_API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${accessToken}` } })
        .then((res) => res.json())
        .then((user) => { setAuth(user, accessToken, refreshToken); navigate("/chat"); })
        .catch(() => navigate("/login?error=oauth_failed"));
    } else {
      navigate("/login?error=oauth_failed");
    }
  }, [searchParams, setAuth, navigate]);

  return <PageLoader />;
}
