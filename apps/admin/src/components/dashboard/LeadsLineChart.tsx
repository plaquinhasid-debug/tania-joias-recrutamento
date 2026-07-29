import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

interface LeadsLineChartProps {
  data: { label: string; total: number }[]
}

export function LeadsLineChart({ data }: LeadsLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="leadsGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#C6A664" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#C6A664" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E1" vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          fontSize={12}
          stroke="#6B6B6B"
        />
        <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#6B6B6B" allowDecimals={false} />
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: "1px solid #E7E5E1",
            fontSize: 13,
          }}
          labelStyle={{ color: "#121212", fontWeight: 600 }}
          formatter={(value: number) => [value, "Leads"]}
        />
        <Area
          type="monotone"
          dataKey="total"
          stroke="#C6A664"
          strokeWidth={2}
          fill="url(#leadsGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
