import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { instrumentsApi } from '@/api/instruments';
import { calibrationsApi, type Calibration } from '@/api/calibrations';
import { attachmentsApi } from '@/api/attachments';
import { apiUrl } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import { format, parseISO } from 'date-fns';
import type { IsoDate } from '@/api/types';
import { btnClass, btnPrimaryClass, QueryState } from '@/components/ui';

/**
 * 계측기 이력카드. 현업이 쓰던 엑셀 양식(A4 가로)을 그대로 옮긴 것이라
 * 화면 구성도 그 양식을 따른다.
 *
 *   윗줄  기본 정보 10칸 (2행)
 *   아래  왼쪽 사진 / 오른쪽 검교정 이력표
 *
 * 인쇄를 전제로 만든 화면이라 상단 메뉴와 버튼은 인쇄에서 빠진다(no-print).
 */

/** 양식이 17행짜리 표라, 이력이 적어도 빈 줄로 그 높이를 채운다 */
const MIN_ROWS = 17;

const cycleText = (months: number | null | undefined): string => {
  if (months == null) return '-';
  return months % 12 === 0 ? `${months / 12}년` : `${months}개월`;
};

const repairText = (v: boolean | null): string => (v == null ? '' : v ? '유' : '무');

/** 양식의 날짜 표기. 2017-02-02 → 17.02.02 */
const cardDate = (v: IsoDate | null | undefined): string => {
  if (!v) return '';
  try {
    return format(parseISO(v), 'yy.MM.dd');
  } catch {
    return v;
  }
};

export default function InstrumentCardPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const instrumentId = Number(id);

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
    <div className="space-y-3">
      <div className="no-print flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={btnClass}
          onClick={() => navigate(`/instruments/${instrumentId}`)}
        >
          ← 상세
        </button>
        <h1 className="text-[24px] font-semibold">계측기 이력카드</h1>
        <button
          type="button"
          className={`${btnPrimaryClass} ml-auto`}
          disabled={!d}
          onClick={() => window.print()}
        >
          인쇄
        </button>
      </div>

      <QueryState isPending={instrument.isPending} error={instrument.error} />

      {d && (
        <div className="card-sheet border border-fg bg-surface text-[17px] text-fg">
          {/* 기본 정보 — 엑셀 양식의 2행 */}
          <div className="card-head grid grid-cols-[auto_1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr]">
            <CardLabel>관리 NO</CardLabel>
            <CardValue mono>{d.mgmtNo}</CardValue>
            <CardLabel>계측기명</CardLabel>
            <CardValue>{d.name}</CardValue>
            <CardLabel>제조사</CardLabel>
            <CardValue>{d.maker}</CardValue>
            <CardLabel>규격</CardLabel>
            <CardValue>{d.specText}</CardValue>
            <CardLabel>정확도</CardLabel>
            <CardValue>{d.accuracy}</CardValue>

            <CardLabel>S/NO</CardLabel>
            <CardValue mono>{d.serialNo}</CardValue>
            <CardLabel>보관장소</CardLabel>
            <CardValue>{d.locationName}</CardValue>
            <CardLabel>사용부서</CardLabel>
            <CardValue>{d.departmentDisplay}</CardValue>
            <CardLabel>교정주기</CardLabel>
            <CardValue>{cycleText(d.calibrationCycleMonths)}</CardValue>
            <CardLabel>관리책임자</CardLabel>
            <CardValue>{d.userName}</CardValue>
          </div>

          {/* 아래 — 왼쪽 사진 / 오른쪽 이력표 */}
          <div className="card-body grid grid-cols-1 border-t border-fg lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="card-photo relative flex min-h-72 items-center justify-center border-b border-fg p-3 lg:border-r lg:border-b-0">
              <span className="absolute top-0 left-0 border-r border-b border-fg px-3 py-1 text-[17px]">
                SKETCH
              </span>
              {photo ? (
                <img
                  src={apiUrl(`/attachment/${photo.id}/download`)}
                  alt={`${d.name} 사진`}
                  className="max-h-[420px] max-w-full object-contain"
                />
              ) : (
                <span className="no-print text-[18px] text-fg-muted">
                  등록된 사진이 없습니다. 상세 화면의 첨부에서 사진을 올리면 여기 나옵니다.
                </span>
              )}
            </div>

            <div className="min-w-0">
              <h2 className="card-title border-b border-fg px-3 py-1.5 text-center text-[19px] font-semibold">
                검교정 현황 (HISTORY) 및 이력사항
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-[16px]">
                  <thead>
                    <tr className="border-b border-fg text-center">
                      <th className="border-r border-line px-2 py-1 font-medium">검교정 기관</th>
                      <th className="border-r border-line px-2 py-1 font-medium">교정일</th>
                      <th className="border-r border-line px-2 py-1 font-medium">차기교정일</th>
                      <th className="border-r border-line px-2 py-1 font-medium">수리여부</th>
                      <th className="border-r border-line px-2 py-1 font-medium">주요조치사항</th>
                      <th className="px-2 py-1 font-medium">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.id} className="border-b border-line">
                        <td className="border-r border-line px-2 py-1 text-center">{c.agencyName ?? ''}</td>
                        <td className="border-r border-line px-2 py-1 text-center whitespace-nowrap">
                          {cardDate(c.performedDate)}
                        </td>
                        <td className="border-r border-line px-2 py-1 text-center whitespace-nowrap">
                          {cardDate(c.nextDueDate)}
                        </td>
                        <td className="border-r border-line px-2 py-1 text-center">
                          {repairText(c.repaired)}
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
    </div>
  );
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-r border-b border-fg bg-bg px-2 py-1.5 text-center font-medium whitespace-nowrap">
      {children}
    </div>
  );
}

function CardValue({ children, mono }: { children?: React.ReactNode; mono?: boolean }) {
  return (
    <div
      className={`border-r border-b border-fg px-2 py-1.5 text-center last:border-r-0 ${mono ? 'code' : ''}`}
    >
      {children == null || children === '' ? ' ' : children}
    </div>
  );
}
