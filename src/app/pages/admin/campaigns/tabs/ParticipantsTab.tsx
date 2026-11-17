import { useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { Input } from "../../../../components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../components/ui/table";
import { cn } from "../../../../lib/utils";
import { campaignsApi } from "../../../../lib/campaigns/api";
import { SUBMISSION_STATUS, fmtDateTime, plural } from "../../../../lib/campaigns/format";
import type { AdminParticipant } from "../../../../lib/campaigns/types";
import { EmptyBox, ErrorBox, LoadingBox, Notice, Stat, useLoader } from "../shared";
import type { TabProps } from "./types";

type Payload = { with_votes: boolean; items: AdminParticipant[] };

export function ParticipantsTab({ campaignId, campaign }: TabProps) {
  const { data, loading, error, reload } = useLoader<Payload>(
    () => campaignsApi.get(`/admin/campaigns/${campaignId}/participants`),
    [campaignId],
  );
  const [q, setQ] = useState("");
  const [seg, setSeg] = useState("all");

  const items = data?.items ?? [];
  const withVotes = !!data?.with_votes;

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter((p) => {
      if (t && !p.user_name.toLowerCase().includes(t) && !(p.department ?? "").toLowerCase().includes(t)) return false;
      if (seg === "sent") return !!p.submission_id;
      if (seg === "not_sent") return !p.submission_id;
      if (seg === "voted") return p.voted === true;
      if (seg === "not_voted") return p.voted === false;
      return true;
    });
  }, [items, q, seg]);

  if (loading && !data) return <LoadingBox />;
  if (error && !data) return <ErrorBox message={error} onRetry={reload} />;

  const sent = items.filter((p) => p.submission_id).length;
  const voted = items.filter((p) => p.voted === true).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Participantes" value={items.length} />
        <Stat label="Enviaram receita" value={sent} />
        <Stat label="Não enviaram" value={items.length - sent} />
        {withVotes && <Stat label="Já votaram" value={voted} />}
      </div>

      {!withVotes && campaign.features.voting && (
        <Notice tone="info">Quem votou (e quando) é um dado sensível e só aparece para quem tem a permissão "Ver votos individuais".</Notice>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative sm:col-span-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou departamento" className="pl-9 rounded-xl h-10" aria-label="Buscar participante" />
        </div>
        <Select value={seg} onValueChange={setSeg}>
          <SelectTrigger className="rounded-xl h-10" aria-label="Filtrar participantes"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="sent">Enviaram receita</SelectItem>
            <SelectItem value="not_sent">Não enviaram receita</SelectItem>
            {withVotes && <SelectItem value="voted">Já votaram</SelectItem>}
            {withVotes && <SelectItem value="not_voted">Ainda não votaram</SelectItem>}
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <EmptyBox icon={<Users size={36} />} title="Nenhum participante encontrado." />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{plural(rows.length, "pessoa", "pessoas")}</p>
          <Card className="rounded-3xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4">Nome</TableHead>
                  <TableHead>Departamento</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Receita</TableHead>
                  <TableHead>Enviada em</TableHead>
                  {withVotes && <TableHead>Votou</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const st = p.submission_status ? SUBMISSION_STATUS[p.submission_status] : null;
                  return (
                    <TableRow key={p.user_id}>
                      <TableCell className="px-4 font-medium">{p.user_name}</TableCell>
                      <TableCell className="text-muted-foreground">{p.department || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{p.unit || "—"}</TableCell>
                      <TableCell>
                        {st ? <Badge className={cn("border text-[10px]", st.className)}>{st.label}</Badge> : <span className="text-xs text-muted-foreground">Não enviou</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fmtDateTime(p.submitted_at)}</TableCell>
                      {withVotes && (
                        <TableCell className="text-xs">
                          {p.voted ? <span>Sim · {fmtDateTime(p.voted_at)}</span> : <span className="text-muted-foreground">Não</span>}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
