import { useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { instrumentsApi, type InstrumentDepartment } from '@/api/instruments';
import { calibrationsApi, type Calibration } from '@/api/calibrations';
import { attachmentsApi } from '@/api/attachments';
import { queryKeys } from '@/api/queryKeys';
import type { IsoDate } from '@/api/types';
import { won } from '@/lib/won';
import AuthImage from '@/components/AuthImage';
import { QueryState } from '@/components/ui';

/**
 * 계측기 이력카드. 현업이 쓰던 엑셀 양식(A4 가로)을 그대로 옮긴다.
 *
 *   제목   측정기 이력카드
 *   머리   기본 정보 4행
 *   본문   왼쪽 구매 정보 + SKETCH 사진 / 오른쪽 검교정 현황(HISTORY)
 *
 * 종이 서식과 칸 이름·차례가 어긋나면 대조할 때 헷갈리므로 양식을 기준으로 맞춘다
 * (원본 서식 대조 2026-09-03). 한 군데만 일부러 다르다 — 교정주기를 "2년" 이 아니라
 * "24개월" 로 적는다. 화면·엑셀이 전부 개월이라 여기만 년으로 두면 같은 값이
 * 달라 보인다(계측기 담당 요청 2026-09-02).
 *
 * 상세 화면 탭과 인쇄 전용 화면이 이 하나를 같이 쓴다. 부르는 조회는 상세와 같은 키라
 * 탭을 옮겨도 다시 받아 오지 않는다.
 */

/** 양식이 17행짜리 표라, 이력이 적어도 빈 줄로 그 높이를 채운다 */
const MIN_ROWS = 17;

/**
 * 사용부서 칸. 종이 서식이 네 갈래에 V 를 치는 꼴이라 그대로 옮긴다.
 * 이름은 서식에 적힌 말을 쓴다 — 시스템 라벨은 RND 를 "연구소" 라 부르지만
 * 종이에는 "개발" 로 찍혀 있다.
 */
const DEPT_BOXES: { key: InstrumentDepartment; label: string }[] = [
  { key: 'PRODUCTION', label: '생산' },
  { key: 'RND', label: '개발' },
  { key: 'QC', label: 'QC' },
  { key: 'ETC', label: '기타' },
];

/**
 * 이력카드에서만 12의 배수를 년으로 적는다 — 종이 양식이 "2년" 이라 그대로 맞춘다
 * (요청 2026-09-03). 목록·상세·엑셀은 개월 그대로다.
 */
const cycleText = (months: number | null | undefined): string => {
  if (months == null) return '';
  return months % 12 === 0 ? `${months / 12}년` : `${months}개월`;
};

/** 양식의 날짜 표기. 2017-02-02 → 17.02.02 */
const cardDate = (v: IsoDate | null | undefined): string => {
  if (!v) return '';
  try {
    return format(parseISO(v), 'yy.MM.dd');
  } catch {
    return v;
  }
};

/** 양식의 금액 표기. 값이 없는 줄은 비워 둔다 — "-" 를 찍으면 손으로 적을 자리가 없다 */
const cardWon = (v: number | null | undefined): string => (v == null ? '' : `₩${won(v)}`);

export default function InstrumentCard({ instrumentId }: { instrumentId: number }) {
  const instrument = useQuery({
    queryKey: queryKeys.instruments.detail(instrumentId),
    queryFn: () => instrumentsApi.detail(instrumentId),
    enabled: Number.isFinite(instrumentId),
  });

  const calibrations = useQuery({
    queryKey: queryKeys.calibrations.byInstrument(instrumentId),
    queryFn: () => calibrationsApi.byInstrument(instrumentId),
    enabled: Number.isFinite(instrumentId),
  });

  const photos = useQuery({
    queryKey: queryKeys.instruments.attachments(instrumentId),
    queryFn: () => attachmentsApi.byInstrument(instrumentId),
    enabled: Number.isFinite(instrumentId),
  });

  const d = instrument.data;

  // 양식은 오래된 교정부터 아래로 쌓는다
  const rows = useMemo<Calibration[]>(
    () =>
      [...(calibrations.data ?? [])]
        .filter((c) => c.performedDate)
        .sort((a, b) => (a.performedDate ?? '').localeCompare(b.performedDate ?? '')),
    [calibrations.data],
  );

  const photo = (photos.data ?? []).find((a) => a.contentType?.startsWith('image/'));

  return (
    <>
      <QueryState isPending={instrument.isPending} error={instrument.error} />

      {/*
        화면에서는 폭을 묶는다. 넓은 모니터에서 끝까지 늘어나면 칸이 휑하게 벌어져
        종이와 딴판으로 보인다는 얘기가 있었다(2026-09-03).
        인쇄는 종이 크기를 따라야 하므로 print 규칙에서 max-width 를 풀어 준다.
      */}
      {d && (
        <div className="card-sheet mx-auto w-full max-w-[1360px] border border-fg bg-surface text-[17px] text-fg">
          <h2 className="card-heading border-b border-fg py-1.5 text-center text-[26px] font-bold tracking-[0.25em]">
            측정기 이력카드
          </h2>

          {/* 머리 — 양식의 기본 정보 3행 */}
          <div className="card-head grid grid-cols-[auto_1fr_auto_1fr_auto_1fr_auto_1fr]">
            <CardLabel>관리 NO</CardLabel>
            <CardValue mono>{d.mgmtNo}</CardValue>
            <CardLabel>계측기명</CardLabel>
            <CardValue>{d.name}</CardValue>
            <CardLabel>규격</CardLabel>
            <CardValue>{d.specText}</CardValue>
            <CardLabel>정확도</CardLabel>
            <CardValue>{d.accuracy}</CardValue>

            <CardLabel>구매일</CardLabel>
            <CardValue>{cardDate(d.purchaseDate)}</CardValue>
            <CardLabel>제작사</CardLabel>
            <CardValue>{d.maker}</CardValue>
            <CardLabel>S/NO</CardLabel>
            <CardValue mono>{d.serialNo}</CardValue>
            <CardLabel>보관장소</CardLabel>
            <CardValue>{d.locationName}</CardValue>

            <CardLabel>사용부서</CardLabel>
            <div className="col-span-3 border-r border-b border-fg px-2 py-1.5">
              {DEPT_BOXES.map(({ key, label }, i) => (
                <span key={key}>
                  {i > 0 && ', '}
                  {label} ({d.department === key ? <b>V</b> : <span>&nbsp;&nbsp;</span>}
                  {key === 'ETC' && d.department === 'ETC' && d.departmentEtc
                    ? ` ${d.departmentEtc}`
                    : ''}
                  )
                </span>
              ))}
            </div>
            <CardLabel>교정주기</CardLabel>
            <CardValue>{cycleText(d.calibrationCycleMonths)}</CardValue>
            <div className="col-span-2 border-b border-fg px-2 py-1.5 text-center">기타 (&nbsp;)</div>
          </div>

          {/* 본문 — 왼쪽 구매 정보와 사진 / 오른쪽 검교정 현황 */}
          <div className="card-body grid grid-cols-1 border-t border-fg lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="flex min-w-0 flex-col border-b border-fg lg:border-r lg:border-b-0">
              <div className="grid grid-cols-[auto_1fr_auto_1fr] border-b border-fg">
                <CardLabel>구매처</CardLabel>
                <CardValue>{d.supplierName}</CardValue>
                <CardLabel>구매가격</CardLabel>
                <div className="px-2 py-1.5 text-center">{cardWon(d.purchasePrice)}</div>
              </div>

              <div className="card-photo relative flex min-h-72 flex-1 items-center justify-center p-3">
                <span className="absolute top-0 left-0 border-r border-b border-fg px-3 py-1 text-[17px]">
                  SKETCH
                </span>
                {photo ? (
                  <AuthImage
                    path={`/attachment/${photo.id}/download`}
                    alt={`${d.name} 사진`}
                    className="max-h-[420px] max-w-full object-contain"
                  />
                ) : (
                  <span className="no-print text-[18px] text-fg-muted">
                    등록된 사진이 없습니다. 관리 정보 탭의 첨부에서 사진을 올리면 여기 나옵니다.
                  </span>
                )}
              </div>
            </div>

            <div className="min-w-0">
              <h2 className="card-title border-b border-fg px-3 py-1.5 text-center text-[19px] font-semibold tracking-[0.15em]">
                검교정 현황 (HISTORY)
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-[16px]">
                  <thead>
                    <tr className="border-b border-fg text-center">
                      <th className="border-r border-line px-2 py-1 font-medium">의뢰처</th>
                      <th className="border-r border-line px-2 py-1 font-medium">교정일</th>
                      <th className="border-r border-line px-2 py-1 font-medium">차기교정일</th>
                      <th className="border-r border-line px-2 py-1 font-medium">교정비용</th>
                      <th className="border-r border-line px-2 py-1 font-medium">이상발생 조치</th>
                      <th className="px-2 py-1 font-medium">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.id} className="border-b border-line">
                        <td className="border-r border-line px-2 py-1 text-center">
                          {c.agencyName ?? ''}
                        </td>
                        <td className="border-r border-line px-2 py-1 text-center whitespace-nowrap">
                          {cardDate(c.performedDate)}
                        </td>
                        <td className="border-r border-line px-2 py-1 text-center whitespace-nowrap">
                          {cardDate(c.nextDueDate)}
                        </td>
                        <td className="num border-r border-line px-2 py-1 whitespace-nowrap">
                          {cardWon(c.cost)}
                        </td>
                        <td className="border-r border-line px-2 py-1">{c.actionNote ?? ''}</td>
                        <td className="px-2 py-1">{c.remark ?? ''}</td>
                      </tr>
                    ))}
                    {/* 양식의 빈 줄. 손으로 적어 넣을 자리가 남아 있어야 한다 */}
                    {Array.from({ length: Math.max(0, MIN_ROWS - rows.length) }, (_, i) => (
                      <tr key={`blank-${i}`} className="border-b border-line">
                        <td className="border-r border-line px-2 py-1">&nbsp;</td>
                        <td className="border-r border-line px-2 py-1" />
                        <td className="border-r border-line px-2 py-1" />
                        <td className="border-r border-line px-2 py-1" />
                        <td className="border-r border-line px-2 py-1" />
                        <td className="px-2 py-1" />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <QueryState isPending={calibrations.isPending} error={calibrations.error} />
            </div>
          </div>

          <div className="border-t border-fg px-3 py-1 text-right text-[15px] text-fg-sub">
            A4(297×210)
          </div>
        </div>
      )}
    </>
  );
}

function CardLabel({ children }: { children: ReactNode }) {
  return (
    <div className="border-r border-b border-fg bg-bg px-2 py-1.5 text-center font-medium whitespace-nowrap">
      {children}
    </div>
  );
}

function CardValue({ children, mono }: { children?: ReactNode; mono?: boolean }) {
  return (
    <div
      className={`border-r border-b border-fg px-2 py-1.5 text-center last:border-r-0 ${mono ? 'code' : ''}`}
    >
      {children == null || children === '' ? ' ' : children}
    </div>
  );
}
