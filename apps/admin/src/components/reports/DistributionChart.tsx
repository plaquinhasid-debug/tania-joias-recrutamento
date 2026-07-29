import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import type { DistributionItem } from "@/hooks/useReports"

interface DistributionChartProps {
  data: DistributionItem[]
}

export function DistributionChart({ data }: DistributionChartProps) {
  const top = data.slice(0, 8)

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={top} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E1" horizontal={false} />
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          fontSize={12}
          width={110}
          stroke="#6B6B6B"
        />
        <Tooltip
          cursor={{ fill: "rgba(198,166,100,0.08)" }}
          contentStyle={{ borderRadius: 8, border: "1px solid #E7E5E1", fontSize: 13 }}
          formatter={(value: number) => [value, "Leads"]}
        />
        <Bar dataKey="total" radius={[0, 6, 6, 0]} fill="#C6A664" maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  )
}
