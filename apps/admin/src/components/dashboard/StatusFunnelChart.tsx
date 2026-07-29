import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { LEAD_STATUS_COLOR, type LeadStatus } from "@tania-joias/shared"

interface StatusFunnelChartProps {
  data: { status: string; label: string; total: number }[]
}

export function StatusFunnelChart({ data }: StatusFunnelChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
        barCategoryGap={18}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E1" horizontal={false} />
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          fontSize={13}
          width={110}
          stroke="#6B6B6B"
        />
        <Tooltip
          cursor={{ fill: "rgba(198,166,100,0.08)" }}
          contentStyle={{ borderRadius: 8, border: "1px solid #E7E5E1", fontSize: 13 }}
          formatter={(value: number) => [value, "Leads"]}
        />
        <Bar dataKey="total" radius={[0, 6, 6, 0]} maxBarSize={28}>
          {data.map((entry) => (
            <Cell key={entry.status} fill={LEAD_STATUS_COLOR[entry.status as LeadStatus]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
