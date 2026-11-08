import { Boot } from "@/components/layout/Boot";
import { Navbar } from "@/components/layout/Navbar";
import { SkillProfile } from "@/components/profile/SkillProfile";

export default function ProfilePage() {
  return (
    <>
      <Boot />
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <SkillProfile />
      </main>
    </>
  );
}
