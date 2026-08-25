import { appConfig, labelsPerSheet } from '@/config/appConfig';
import { Badge, Section } from '@/components/ui';

export default function ConfigTab() {
  return (
    <div className="space-y-3">
      <Section title="라벨·스티커">
        <div className="space-y-2 px-3 py-3 text-[19px]">
          <div>
            <span className="text-fg-sub">라벨지 규격 · </span>
            <Badge tone={appConfig.sticker.label.confirmed ? 'accent' : 'warn'}>
              {appConfig.sticker.label.widthMm} × {appConfig.sticker.label.heightMm}mm ·{' '}
              {appConfig.sticker.label.columns}열 × {appConfig.sticker.label.rows}행 ={' '}
              {labelsPerSheet()}칸
            </Badge>
          </div>
          <div>
            <span className="text-fg-sub">인쇄 항목 {appConfig.sticker.fields.length}개 · </span>
            {appConfig.sticker.fields.map((f) => (
              <span key={f.key} className="mr-2">
                <Badge tone={f.confirmed ? 'accent' : 'warn'}>{f.label}</Badge>
              </span>
            ))}
          </div>
          <div>
            <span className="text-fg-sub">QR 포함 · </span>
            <Badge tone={appConfig.sticker.includeQr.confirmed ? 'accent' : 'warn'}>
              {appConfig.sticker.includeQr.value ? '포함' : '미포함'}
              {appConfig.sticker.includeQr.confirmed ? '' : ' (회신 대기)'}
            </Badge>
          </div>
        </div>
      </Section>

      <Section title="알림">
        <div className="space-y-2 px-3 py-3 text-[19px]">
          <div>
            <span className="text-fg-sub">발송 시점 · </span>
            <Badge tone="accent">알림 화면에서 관리</Badge>
            <span className="ml-2 text-fg-muted">
              서버 설정값이라 이 파일에 두지 않습니다.
            </span>
          </div>
          <div>
            <span className="text-fg-sub">수신자 · </span>
            {appConfig.notification.recipients.value.length === 0 ? (
              <Badge tone="warn">미지정 (회신 대기)</Badge>
            ) : (
              appConfig.notification.recipients.value.join(', ')
            )}
          </div>
          <div>
            <span className="text-fg-sub">발송 방식 · </span>
            <Badge tone={appConfig.notification.channel.confirmed ? 'accent' : 'warn'}>
              {appConfig.notification.channel.value}
            </Badge>
          </div>
          <p className="text-[18px] text-fg-muted">
            백엔드에 알림 수신 이메일·발송 API(/notification-email, /notification)가 있습니다. 화면은
            아직 붙이지 않았습니다.
          </p>
        </div>
      </Section>

      <Section title="감가상각">
        <div className="space-y-2 px-3 py-3 text-[19px]">
          <div>
            <span className="text-fg-sub">무형자산 상각 기준 · </span>
            <Badge tone={appConfig.depreciation.intangibleBasisConfirmed ? 'accent' : 'warn'}>
              {appConfig.depreciation.intangibleBasisConfirmed ? '확정' : '미확정 (회신 대기)'}
            </Badge>
          </div>
          <div>
            <span className="text-fg-sub">실적 누적 시작 연도 · </span>
            {appConfig.depreciation.yearlyDataAvailableFrom}년
          </div>
        </div>
      </Section>

      <p className="px-1 text-[18px] text-fg-muted">
        이 값들은 <span className="code">src/config/appConfig.ts</span> 한 곳에서 관리합니다. 관리팀
        회신이 오면 그 파일만 고칩니다.
      </p>
    </div>
  );
}
