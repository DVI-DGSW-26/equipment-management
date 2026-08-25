import { Fragment, useState } from 'react';
import type { Asset } from '@/api/assets';
import type { PhysicalAsset } from '@/api/physicalAssets';
import { useItems } from '@/hooks/useMasters';
import { appConfig, labelsPerSheet, type StickerFieldKey } from '@/config/appConfig';
import { fmtDate } from '@/lib/date';
import Modal from '@/components/Modal';
import { Badge, btnClass, btnPrimaryClass, inputClass } from '@/components/ui';

/** 값이 비어 있는 칸 */
const NO_VALUE = '—';

/**
 * 라벨 한 칸의 표 — 4행 × 4열(라벨·값·라벨·값).
 *
 * 관리팀 자산 스티커 견본(2026-08-24)의 배치를 그대로 따른다.
 * 라벨은 굵게·자간을 벌리고, 값은 가운데 정렬, 자산번호만 고정폭.
 *
 * 서버가 만드는 PDF 도 같은 배치를 쓴다 (2026-08-24 백엔드 반영 확인).
 */
function StickerFace({ value }: { value: (key: StickerFieldKey) => string }) {
  const fields = appConfig.sticker.fields;
  const pairs = Array.from({ length: Math.ceil(fields.length / 2) }, (_, r) =>
    fields.slice(r * 2, r * 2 + 2),
  );

  /** [라벨1, 값1, 라벨2, 값2] 너비 비율. 자산번호 행은 값 칸을 넓게 */
  const widthsFor = (keys: StickerFieldKey[]): number[] =>
    keys.includes('assetCode') ? [20, 45, 23, 12] : [20, 27, 23, 30];

  return (
    <div className="flex h-full flex-col border border-fg">
      {pairs.map((pair, r) => {
        const w = widthsFor(pair.map((f) => f.key));
        return (
          <div key={r} className={`flex flex-1 ${r > 0 ? 'border-t border-fg' : ''}`}>
            {pair.map((f, i) => (
              <Fragment key={f.key}>
                <div
                  className={`flex items-center justify-center px-0.5 text-center text-[10px] leading-tight font-bold tracking-[0.15em] ${
                    i > 0 ? 'border-l border-fg' : ''
                  }`}
                  style={{ width: `${w[i * 2]}%` }}
                >
                  {f.label}
                </div>
                <div
                  className={`flex items-center justify-center border-l border-fg px-0.5 text-center text-[10px] leading-tight break-all ${
                    f.key === 'assetCode' ? 'code' : ''
                  }`}
                  style={{ width: `${w[i * 2 + 1]}%` }}
                >
                  {value(f.key)}
                </div>
              </Fragment>
            ))}
          </div>
        );
      })}
    </div>
  );
}

type Source =
  /** 여러 개를 한 건으로 산 비품. 실물 단위로 쪼개져 있다 */
  | { source: 'physical'; items: PhysicalAsset[] }
  /** 기계장치·시설장치처럼 고정자산 1건 = 실물 1대인 자산 */
  | { source: 'asset'; items: Asset[] };

type Props = Source & {
  onClose: () => void;
  onDownload: (startPosition: number) => void;
  isDownloading: boolean;
};

/**
 * 스티커 미리보기. 고정자산·실물자산 두 경로가 같은 라벨 서식을 쓴다.
 *
 * 인쇄 항목 8개를 두 응답에서 각각 끌어온다. 값이 비어 있으면 "—" 로 둔다.
 *
 * PDF 는 서버가 만든다. 이 화면은 배치 확인용이며 브라우저 인쇄를 쓰지 않는다.
 */
export default function StickerPreviewModal(props: Props) {
  const { onClose, onDownload, isDownloading } = props;
  const [startPosition, setStartPosition] = useState(1);
  const perSheet = labelsPerSheet();
  const { columns, rows, widthMm, heightMm } = appConfig.sticker.label;

  // 품목명은 두 응답 모두 코드만 내려준다. 품목 코드는 비품구분 안에서만
  // 유일하므로 itemTypeCode 까지 맞춰서 마스터에서 찾는다.
  const itemMaster = useItems();

  const itemName = (itemTypeCode: string | null, itemCode: string | null): string => {
    if (!itemCode) return NO_VALUE;
    const found = (itemMaster.data ?? []).find(
      (i) => i.code === itemCode && i.itemTypeCode === itemTypeCode,
    );
    return found ? found.name : itemCode;
  };

  const text = (v: string | null | undefined): string => (v && v !== '' ? v : NO_VALUE);

  const resolve = (index: number) => (key: StickerFieldKey): string => {
    if (props.source === 'physical') {
      const a = props.items[index];
      switch (key) {
        case 'assetCode':
          return text(a.assetCode);
        case 'registered':
          return a.registered ? 'O' : 'X';
        case 'category':
          return text(a.categoryName);
        case 'acquisitionDate':
          return a.acquisitionDate ? fmtDate(a.acquisitionDate) : NO_VALUE;
        case 'item':
          return itemName(a.itemTypeCode, a.itemCode);
        case 'modelName':
          return text(a.modelName);
        case 'supplier':
          return text(a.supplier);
        case 'department':
          return text(a.deptName);
      }
    }

    const a = props.items[index];
    switch (key) {
      case 'assetCode':
        return text(a.assetCode);
      case 'registered':
        return a.registered ? 'O' : 'X';
      case 'category':
        return text(a.categoryName);
      case 'acquisitionDate':
        return a.acquisitionDate ? fmtDate(a.acquisitionDate) : NO_VALUE;
      case 'item':
        return itemName(a.itemTypeCode, a.itemCode);
      case 'modelName':
        return text(a.modelName);
      case 'supplier':
        return text(a.supplier);
      case 'department':
        return text(a.usingDeptName);
    }
  };

  const count = props.items.length;
  /** 시작 위치만큼 앞칸을 비우고 라벨을 채운다. 값은 원본 인덱스 */
  const slots: (number | null)[] = [
    ...Array.from({ length: startPosition - 1 }, () => null),
    ...props.items.map((_, i) => i),
  ];
  const sheets = Math.ceil(slots.length / perSheet) || 1;
  const firstSheet = Array.from({ length: perSheet }, (_, i) => slots[i] ?? null);

  return (
    <Modal
      title={
        <span className="flex items-center gap-2">
          스티커 미리보기
          <span className="font-normal text-fg-sub">
            {props.source === 'asset' ? '고정자산' : '실물자산'} {count}건 · 라벨지 {sheets}장
          </span>
        </span>
      }
      width={760}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnClass} onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className={btnPrimaryClass}
            disabled={isDownloading || count === 0}
            onClick={() => onDownload(startPosition)}
          >
            {isDownloading ? '생성 중…' : 'PDF 내려받기'}
          </button>
        </>
      }
    >
      <div className="mb-3 flex items-end gap-3">
        <label className="block">
          <span className="mb-0.5 block text-[18px] text-fg-sub">시작 위치</span>
          <select
            className={`${inputClass} w-28`}
            value={startPosition}
            onChange={(e) => setStartPosition(Number(e.target.value))}
          >
            {Array.from({ length: perSheet }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}번 칸
              </option>
            ))}
          </select>
        </label>
        <p className="pb-1 text-[17px] text-fg-muted">
          {widthMm} × {heightMm}mm · {columns}열 × {rows}행 = {perSheet}칸 · QR 없음. 쓰다 만
          라벨지는 시작 위치를 옮겨 남은 칸부터 인쇄합니다.
        </p>
      </div>

      {/* 첫 장 배치만 보여준다. 실제 PDF 는 서버가 만든다 */}
      <div className="rounded-sm border border-line bg-bg p-3">
        <div className="mb-2 text-[17px] text-fg-sub">라벨지 1장째 배치</div>
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {firstSheet.map((index, i) => (
            <div
              key={i}
              className={
                index === null ? 'rounded-sm border border-dashed border-line' : 'rounded-sm bg-surface'
              }
              style={{ aspectRatio: `${widthMm} / ${heightMm}` }}
            >
              {index === null ? (
                <div className="flex h-full items-center justify-center text-[16px] text-fg-muted">
                  {i + 1} · 비움
                </div>
              ) : (
                <StickerFace value={resolve(index)} />
              )}
            </div>
          ))}
        </div>
        {slots.length > perSheet && (
          <p className="mt-2 text-[17px] text-fg-muted">
            나머지 {slots.length - perSheet}칸은 다음 장에 이어서 인쇄됩니다.
          </p>
        )}
      </div>

      <p className="mt-3 text-[17px] text-fg-muted">
        <Badge tone="muted">참고</Badge> 자산코드 미부여·출력 제외 대상은 서버가 건너뜁니다.
      </p>
    </Modal>
  );
}
