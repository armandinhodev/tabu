import { AppRoot } from "@/ui/app-root";
import { Providers } from "@/ui/providers";
import { readHouseRules } from "@/infrastructure/content/house-rules";

export default function PlayPage() {
  return (
    <Providers>
      <AppRoot rules={readHouseRules()} />
    </Providers>
  );
}
