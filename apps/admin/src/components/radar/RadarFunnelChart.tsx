import { Funnel, FunnelChart, LabelList, ResponsiveContainer, Tooltip, Cell } from "recharts"

import type { RadarStep } from "@/hooks/useRadarFunil"

const COLORS = ["#121212", "#3d3630", "#8a745a", "#C6A664", "#1F8A4C"]

export function RadarFunnelChart({ steps }: { steps: RadarStep[] }) {
  const data = steps.map((step) => ({ name: step.label, value: step.total }))

  return (
    <ResponsiveContainer width="100%" height={360}>
      <FunnelChart>
        <Tooltip
          contentStyle={{ borderRadius: 8, border: "1px solid #E7E5E1", fontSize: 13 }}
          formatter={(value: number) => [value, "Eventos"]}
        />
        <Funnel dataKey="value" data={data} isAnimationActive>
          {data.map((entry, index) => (
            <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
          ))}
          <LabelList position="right" dataKey="name" stroke="none" fill="#121212" fontSize={13} />
          <LabelList
            position="center"
            dataKey="value"
            stroke="none"
            fill="#ffffff"
            fontSize={14}
            fontWeight={600}
          />
        </Funnel>
      </FunnelChart>
    </ResponsiveContainer>
  )
}
