"use client";

/**
 * PeopleModel — W26 (People · one list, three hats), W33 and W35 (today's
 * profile drawer → the three hats, the section map). One screen under
 * `?view=model`, reached from the header's "How it fits together".
 *
 * The example rows are THIS workspace's people (up to six), each with the
 * hats they wear and the sentence those hats mean; the board's Dani, Pau and
 * Ana are what the rows look like once a workspace has them. The
 * customer-facing word is drawn disabled: nothing stores it yet (D-POS-37),
 * and the POS and the booking page say "Professional".
 */

import { FactRow } from "@/components/admin/shell/internal/page-modules/appointments-classes-ui";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { personNameOr } from "@/lib/people/display-name";
import { PERSON_HATS, type PersonHat, type PersonRecord } from "@/lib/people/hats";
import { PEOPLE_SELECT } from "./people-classes";
import { CARD, Callout, HatChip, MutedChip, TD, TD_MUTED, Table } from "./people-ui";
import { hatsWorn } from "./people-views";

const K = "admin.people";
const M = "admin.people.model";

type MapRow = {
  id: string;
  hats: readonly PersonHat[] | "person" | "none";
  /** Public profile AND Person (the Admin row), drawn as two chips. */
  alsoPerson?: boolean;
  changes: boolean;
  reads: boolean;
};

const MAP_ONE: readonly MapRow[] = [
  { id: "identity", hats: ["publicProfile"], changes: false, reads: true },
  { id: "about", hats: ["publicProfile"], changes: false, reads: true },
  { id: "location", hats: ["publicProfile"], changes: false, reads: true },
  { id: "services", hats: ["publicProfile"], changes: true, reads: true },
  { id: "availability", hats: ["publicProfile"], changes: true, reads: true },
  { id: "bookingHours", hats: ["bookable"], changes: true, reads: true },
  { id: "logistics", hats: ["publicProfile"], changes: false, reads: true },
  { id: "media", hats: ["publicProfile"], changes: false, reads: true },
  { id: "bookingTerms", hats: ["publicProfile", "bookable"], changes: true, reads: true },
  { id: "limits", hats: ["publicProfile"], changes: false, reads: true },
  { id: "credits", hats: ["publicProfile"], changes: false, reads: true },
];

const MAP_TWO: readonly MapRow[] = [
  { id: "trust", hats: ["publicProfile"], changes: true, reads: true },
  { id: "files", hats: ["publicProfile"], changes: false, reads: true },
  { id: "agencyFields", hats: ["publicProfile"], changes: true, reads: true },
  { id: "admin", hats: ["publicProfile"], alsoPerson: true, changes: true, reads: true },
  { id: "history", hats: "person", changes: true, reads: true },
  { id: "header", hats: ["publicProfile"], changes: false, reads: true },
  { id: "menu", hats: ["publicProfile"], changes: true, reads: false },
  { id: "teamDrawer", hats: ["access"], changes: true, reads: false },
  { id: "rosterPage", hats: ["publicProfile"], changes: true, reads: false },
  { id: "resources", hats: "none", changes: true, reads: true },
];

export function PeopleModel({ people }: { people: readonly PersonRecord[] }) {
  const t = useT();
  const examples = people.slice(0, 6);
  const word = t(`${M}.wordValue`);

  return (
    <div className="flex flex-col gap-[16px]" data-testid="people-model">
      {/* The person and the three hats */}
      <div className="grid grid-cols-[0.75fr_1fr_1fr_1fr] gap-[12px]">
        <div className={`${CARD} flex flex-col gap-[10px] p-[16px]`}>
          <div className="flex items-center gap-[10px]">
            <span className="inline-flex h-[36px] w-[36px] items-center justify-center rounded-full bg-admin-brand text-[15px] font-semibold text-white">P</span>
            <div>
              <div className="text-[15px] font-semibold text-admin-ink">{t(`${M}.person`)}</div>
              <div className="text-[11.5px] text-admin-ink-muted">{t(`${M}.personSub`)}</div>
            </div>
          </div>
          <p className="m-0 text-[12.5px] leading-[1.45] text-admin-ink-muted">{t(`${M}.personWhat`)}</p>
          <FactRow label={t(`${M}.hatsHere`)}>
            <span className="flex flex-wrap justify-end gap-[4px]">
              {PERSON_HATS.map((h) => (
                <HatChip key={h} hat={h} label={t(`${K}.hat.${h}`)} />
              ))}
            </span>
          </FactRow>
          <FactRow label={t(`${M}.elsewhere`)} muted>
            {t(`${M}.elsewhereValue`)}
          </FactRow>
        </div>
        {PERSON_HATS.map((hat) => (
          <div key={hat} className={`${CARD} flex flex-col gap-[8px] p-[16px]`}>
            <div className="flex items-center justify-between gap-[8px]">
              <div className="text-[15px] font-semibold text-admin-ink">{t(`${M}.hatTitle.${hat}`)}</div>
              <HatChip hat={hat} label={t(`${M}.badge.${hat}`)} />
            </div>
            <p className="m-0 text-[12.5px] leading-[1.45] text-admin-ink-muted">{t(`${M}.hatWhat.${hat}`)}</p>
            <FactRow label={t(`${M}.whoEdits`)}>{t(`${M}.whoEditsValue.${hat}`)}</FactRow>
            <FactRow label={t(`${M}.readBy`)}>{t(`${M}.readByValue.${hat}`)}</FactRow>
            <p className="m-0 text-[11.5px] leading-[1.45] text-admin-ink-muted">
              <b className="font-semibold text-admin-ink">{t(`${M}.home`)}</b> {t(`${M}.homeValue.${hat}`)}
            </p>
          </div>
        ))}
      </div>

      {/* Your people, as examples */}
      {examples.length === 0 ? (
        <Callout tone="slate">{t(`${M}.examplesEmpty`)}</Callout>
      ) : (
        <Table head={[t(`${M}.exampleCol.example`), t(`${M}.exampleCol.hats`), t(`${M}.exampleCol.why`), t(`${M}.exampleCol.posShows`)]} testId="people-model-examples">
          {examples.map((p) => {
            const worn = hatsWorn(p);
            const name = personNameOr(p.name, t(`${K}.unnamed`));
            const whyKey = worn.length === 0 ? "none" : worn.join("+");
            return (
              <tr key={p.key}>
                <td className={`${TD} font-semibold`}>
                  {name}
                  {p.role ? <span className="font-normal text-admin-ink-muted"> · {t(`${K}.role.${p.role}`)}</span> : null}
                </td>
                <td className={TD}>
                  <span className="flex flex-wrap gap-[4px]">
                    {worn.length === 0 ? <MutedChip>{t(`${M}.why.none`)}</MutedChip> : null}
                    {worn.map((h) => (
                      <HatChip key={h} hat={h} label={t(`${K}.hat.${h}`)} />
                    ))}
                  </span>
                </td>
                <td className={TD_MUTED}>{t(`${M}.why.${whyKey}`)}</td>
                <td className={p.bookable.on ? TD : TD_MUTED}>{p.bookable.on ? interpolate(t(`${M}.posShows`), { word, name }) : t(`${M}.posShowsNone`)}</td>
              </tr>
            );
          })}
        </Table>
      )}

      {/* The customer-facing word, and the two notes */}
      <div className="grid grid-cols-[1fr_0.9fr_0.9fr] gap-[16px]">
        <div className={`${CARD} flex flex-col gap-[10px] p-[16px]`} data-testid="people-customer-word">
          <div className="text-[14px] font-semibold text-admin-ink">{t(`${M}.wordTitle`)}</div>
          <div className="grid grid-cols-2 gap-[12px]">
            <label className="flex flex-col gap-[6px] text-[12.5px] font-semibold text-admin-ink">
              {t(`${M}.wordSingular`)}
              <select className={PEOPLE_SELECT} disabled title={t(`${M}.wordOff`)} value="professional" onChange={() => undefined}>
                <option value="professional">{t(`${M}.wordValue`)}</option>
              </select>
              <span className="text-[11px] font-normal text-admin-ink-muted">{t(`${M}.wordExamples`)}</span>
            </label>
            <label className="flex flex-col gap-[6px] text-[12.5px] font-semibold text-admin-ink">
              {t(`${M}.wordPlural`)}
              <select className={PEOPLE_SELECT} disabled title={t(`${M}.wordOff`)} value="professionals" onChange={() => undefined}>
                <option value="professionals">{t(`${M}.wordValuePlural`)}</option>
              </select>
            </label>
          </div>
          <p className="m-0 text-[11.5px] leading-[1.45] text-admin-ink-muted">{t(`${M}.wordNote`)}</p>
          <p className="m-0 rounded-[9px] bg-admin-surface-alt px-[10px] py-[8px] text-[12px] leading-[1.45] text-admin-ink" data-not-wired="true">
            {t(`${M}.wordOff`)}
          </p>
        </div>
        <Callout tone="indigo">
          <b className="font-semibold">{t(`${M}.whyNotTitle`)}</b> {t(`${M}.whyNot`)}
        </Callout>
        <Callout tone="slate">
          <b className="font-semibold text-admin-ink">{t(`${M}.migrationTitle`)}</b> {t(`${M}.migration`)}
        </Callout>
      </div>

      <SectionMap title={t(`${M}.mapTitle1`)} sub={t(`${M}.mapSub1`)} rows={MAP_ONE} testId="people-map-1" />
      <SectionMap title={t(`${M}.mapTitle2`)} sub={t(`${M}.mapSub2`)} rows={MAP_TWO} testId="people-map-2" />
    </div>
  );
}

function SectionMap({ title, sub, rows, testId }: { title: string; sub: string; rows: readonly MapRow[]; testId: string }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-[12px]">
      <div>
        <h2 className="m-0 text-[18px]! font-semibold tracking-[-0.02em] text-admin-ink">{title}</h2>
        <p className="m-0 mt-[2px] text-admin-13 text-admin-ink-muted">{sub}</p>
      </div>
      <Table head={[t(`${M}.mapCol.section`), t(`${M}.mapCol.holds`), t(`${M}.mapCol.hat`), t(`${M}.mapCol.changes`), t(`${M}.mapCol.reads`)]} testId={testId}>
        {rows.map((row) => (
          <tr key={row.id}>
            <td className={`${TD} w-[15%] align-top font-semibold`}>{t(`${M}.map.${row.id}`)}</td>
            <td className={`${TD_MUTED} w-[30%] align-top text-[12px]`}>{t(`${M}.map.${row.id}Holds`)}</td>
            <td className={`${TD} w-[12%] align-top`}>
              <span className="flex flex-col items-start gap-[4px]">
                {row.hats === "person" ? (
                  <MutedChip>{t(`${M}.personHat`)}</MutedChip>
                ) : row.hats === "none" ? (
                  <span className="text-admin-ink-dim">{t(`${M}.noHat`)}</span>
                ) : (
                  row.hats.map((h) => <HatChip key={h} hat={h} label={t(`${K}.hat.${h}`)} />)
                )}
                {row.alsoPerson ? <MutedChip>{t(`${M}.personHat`)}</MutedChip> : null}
              </span>
            </td>
            <td className={`${TD} w-[21%] align-top text-[12px]`}>
              {row.changes ? t(`${M}.map.${row.id}Changes`) : <span className="text-admin-green">{t(`${M}.unchanged`)}</span>}
            </td>
            <td className={`${TD_MUTED} align-top text-[12px]`}>{row.reads ? t(`${M}.map.${row.id}Reads`) : <span className="text-admin-ink-dim">{t(`${M}.noHat`)}</span>}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
