import { AcademicLibrary } from "@/components/academic-library";
export default async function PublicDiagramPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AcademicLibrary id={id} />;
}
