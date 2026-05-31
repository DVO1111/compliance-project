import { type PlanFeature } from '../../lib/plans';

interface FeatureGateProps {
  feature: PlanFeature;
  featureLabel: string;
  children: React.ReactNode;
}

export default function FeatureGate({ children }: FeatureGateProps) {
  return <>{children}</>;
}
