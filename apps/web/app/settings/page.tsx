import { SettingsForm } from "@/components/settings/SettingsForm"

export default async function SettingsPage() {
  const projectKey = process.env.PROJECT_KEY || "pk_live_vg_c8f2a91d3e4b5f6a"
  return <SettingsForm projectKey={projectKey} />
}
