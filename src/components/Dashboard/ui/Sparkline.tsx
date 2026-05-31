import { ResponsiveContainer, AreaChart, Area } from 'recharts';

interface SparklineProps {
    data: number[];
    color?: string;
    height?: number;
}

export default function Sparkline({ data, color = 'var(--color-accent)', height = 32 }: SparklineProps) {
    // Convert array to recharts format
    const chartData = data.map((val, i) => ({ value: val, index: i }));

    return (
        <div style={{ width: '100%', height: height }}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                    <defs>
                        <linearGradient id="sparkGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <Area
                        type="monotone"
                        dataKey="value"
                        stroke={color}
                        strokeWidth={1.5}
                        fillOpacity={1}
                        fill="url(#sparkGradient)"
                        isAnimationActive={false}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
