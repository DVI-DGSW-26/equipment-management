import { useEffect, useState } from 'react';
import { requestFile } from '@/api/client';

/**
 * 토큰이 필요한 이미지.
 *
 * <img src="/api/..."> 는 브라우저가 직접 받아 가므로 Authorization 헤더를 붙일 수 없다.
 * 서버 인증이 켜지면 그대로 401 이 되니, 파일로 받아 objectURL 로 바꿔 끼운다.
 */
export default function AuthImage({
  path,
  alt,
  className,
}: {
  path: string;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    let dropped = false;
    let created: string | undefined;

    void requestFile('GET', path, 'image')
      .then(({ blob }) => {
        /* 화면에서 이미 사라졌으면 만들지 않는다 */
        if (dropped) return;
        created = URL.createObjectURL(blob);
        setUrl(created);
      })
      .catch(() => {
        /* 첨부 하나가 안 열려도 화면 전체를 막지 않는다 */
      });

    return () => {
      dropped = true;
      if (created) URL.revokeObjectURL(created);
      setUrl(undefined);
    };
  }, [path]);

  if (!url) return <span className={className} aria-hidden />;
  return <img src={url} alt={alt} className={className} />;
}
