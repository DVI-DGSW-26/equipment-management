import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  instrumentsApi,
  INSTRUMENT_DEPARTMENT_LABEL,
  type CreateInstrumentPayload,
  type InstrumentDepartment,
  type InstrumentDetail,
} from '@/api/instruments';
import { isSupplier } from '@/api/instrumentMasters';
import { queryKeys } from '@/api/queryKeys';
import { useInstrumentLocations, usePartners } from '@/hooks/useMasters';
import Modal from '@/components/Modal';
import { useToast } from '@/components/toastContext';
import { btnClass, btnPrimaryClass, Field, inputClass } from '@/components/ui';

/** 등록·수정 공용. instrument 가 있으면 수정 (관리번호는 채번 후 바꾸지 않는다) */
export default function InstrumentModal({
  instrument,
  onClose,
}: {
  instrument?: InstrumentDetail;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();

  const [form, setForm] = useState({
    mgmtNo: instrument?.mgmtNo ?? '',
    name: instrument?.name ?? '',
    serialNo: instrument?.serialNo ?? '',
    maker: instrument?.maker ?? '',
    specText: instrument?.specText ?? '',
    accuracy: instrument?.accuracy ?? '',
    calibrationCycleMonths: String(instrument?.calibrationCycleMonths ?? 12),
    department: (instrument?.department ?? '') as InstrumentDepartment | '',
    departmentEtc: instrument?.departmentEtc ?? '',
    locationId: instrument?.locationId != null ? String(instrument.locationId) : '',
    userName: instrument?.userName ?? '',
    purchaseDate: instrument?.purchaseDate ?? '',
    purchasePrice: instrument?.purchasePrice != null ? String(instrument.purchasePrice) : '',
    supplierId: instrument?.supplierId != null ? String(instrument.supplierId) : '',
    assetId: instrument?.assetId != null ? String(instrument.assetId) : '',
    remark: instrument?.remark ?? '',
  });

  const locations = useInstrumentLocations();
  const partners = usePartners();

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const body: CreateInstrumentPayload = {
        name: form.name.trim(),
        calibrationCycleMonths: Number(form.calibrationCycleMonths),
        serialNo: form.serialNo || undefined,
        maker: form.maker || undefined,
        specText: form.specText || undefined,
        accuracy: form.accuracy || undefined,
        department: form.department || undefined,
        departmentEtc: form.department === 'ETC' ? form.departmentEtc || undefined : undefined,
        locationId: form.locationId ? Number(form.locationId) : undefined,
        userName: form.userName || undefined,
        purchaseDate: form.purchaseDate || undefined,
        purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : undefined,
        supplierId: form.supplierId ? Number(form.supplierId) : undefined,
        assetId: form.assetId ? Number(form.assetId) : undefined,
        remark: form.remark || undefined,
      };
      if (instrument) return instrumentsApi.update(instrument.id, body);
      return instrumentsApi.create({ ...body, mgmtNo: form.mgmtNo || undefined });
    },
    onSuccess: () => {
      toast.ok(instrument ? '수정했습니다.' : '계측기를 등록했습니다.');
      void qc.invalidateQueries({ queryKey: queryKeys.instruments.all });
      onClose();
    },
    onError: toast.fail,
  });

  return (
    <Modal
      title={instrument ? '계측기 수정' : '계측기 등록'}
      width={860}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnClass} onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            className={btnPrimaryClass}
            disabled={save.isPending || form.name.trim() === '' || !form.calibrationCycleMonths}
            onClick={() => save.mutate()}
          >
            저장
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="관리번호"
          hint={instrument ? '채번 후 변경하지 않습니다.' : '비우면 DVIG-001 형식으로 자동 채번'}
        >
          <input
            className={inputClass}
            value={form.mgmtNo}
            disabled={!!instrument}
            onChange={(e) => set('mgmtNo', e.target.value)}
          />
        </Field>
        <Field label="계측기명" required>
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <Field label="S/NO" hint="분실 시 비워 둡니다.">
          <input
            className={inputClass}
            value={form.serialNo}
            onChange={(e) => set('serialNo', e.target.value)}
          />
        </Field>
        <Field label="제작사">
          <input
            className={inputClass}
            value={form.maker}
            onChange={(e) => set('maker', e.target.value)}
          />
        </Field>
        <Field label="규격">
          <input
            className={inputClass}
            value={form.specText}
            onChange={(e) => set('specText', e.target.value)}
          />
        </Field>
        <Field label="정도 / 정확도">
          <input
            className={inputClass}
            value={form.accuracy}
            onChange={(e) => set('accuracy', e.target.value)}
          />
        </Field>
        <Field label="교정주기(개월)" required hint="1년=12, 2년=24">
          <input
            className={`${inputClass} num`}
            inputMode="numeric"
            value={form.calibrationCycleMonths}
            onChange={(e) => set('calibrationCycleMonths', e.target.value.replace(/[^\d]/g, ''))}
          />
        </Field>
        <Field label="사용부서">
          <select
            className={inputClass}
            value={form.department}
            onChange={(e) => set('department', e.target.value)}
          >
            <option value="">선택</option>
            {(Object.keys(INSTRUMENT_DEPARTMENT_LABEL) as InstrumentDepartment[]).map((d) => (
              <option key={d} value={d}>
                {INSTRUMENT_DEPARTMENT_LABEL[d]}
              </option>
            ))}
          </select>
        </Field>
        {form.department === 'ETC' && (
          <Field label="사용부서 직접 입력">
            <input
              className={inputClass}
              value={form.departmentEtc}
              onChange={(e) => set('departmentEtc', e.target.value)}
            />
          </Field>
        )}
        <Field label="사용위치">
          <select
            className={inputClass}
            value={form.locationId}
            onChange={(e) => set('locationId', e.target.value)}
          >
            <option value="">선택</option>
            {(locations.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="사용자" hint="여러 작업자가 공용하면 비워 둡니다.">
          <input
            className={inputClass}
            value={form.userName}
            onChange={(e) => set('userName', e.target.value)}
          />
        </Field>
        <Field label="구매일">
          <input
            type="date"
            className={inputClass}
            value={form.purchaseDate}
            onChange={(e) => set('purchaseDate', e.target.value)}
          />
        </Field>
        <Field label="구매가격">
          <input
            className={`${inputClass} num`}
            inputMode="numeric"
            value={form.purchasePrice}
            onChange={(e) => set('purchasePrice', e.target.value.replace(/[^\d]/g, ''))}
          />
        </Field>
        <Field label="구매처">
          <select
            className={inputClass}
            value={form.supplierId}
            onChange={(e) => set('supplierId', e.target.value)}
          >
            <option value="">선택</option>
            {(partners.data ?? []).filter(isSupplier).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="연결 고정자산 ID" hint="고정자산 등록 대상이 아니면 비웁니다.">
          <input
            className={`${inputClass} num`}
            inputMode="numeric"
            value={form.assetId}
            onChange={(e) => set('assetId', e.target.value.replace(/[^\d]/g, ''))}
          />
        </Field>
        <div className="col-span-2">
          <Field label="비고">
            <input
              className={inputClass}
              value={form.remark}
              onChange={(e) => set('remark', e.target.value)}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
