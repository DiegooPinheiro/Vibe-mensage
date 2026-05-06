import useOnlineStatus from './useOnlineStatus';
import useOnlineStatusByEmail from './useOnlineStatusByEmail';

export default function useOnlineStatusByIdentity({
  uid,
  email,
  enabled = true,
}: {
  uid?: string | null;
  email?: string | null;
  enabled?: boolean;
}) {
  const normalizedUid = (uid || '').trim();
  const normalizedEmail = (email || '').trim().toLowerCase();
  const byUid = useOnlineStatus(normalizedUid, enabled && !!normalizedUid);
  const byEmail = useOnlineStatusByEmail(normalizedEmail, enabled && !normalizedUid && !!normalizedEmail);

  return normalizedUid ? byUid : byEmail;
}
