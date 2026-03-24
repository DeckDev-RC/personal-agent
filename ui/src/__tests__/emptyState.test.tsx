import { render, screen } from "@testing-library/react";
import { Mail } from "lucide-react";
import EmptyState from "../components/shared/EmptyState";

describe("EmptyState", () => {
  it("renders a component icon passed by reference", () => {
    render(<EmptyState icon={Mail} title="Sem mensagens" description="Nada por aqui." />);

    expect(screen.getByText("Sem mensagens")).toBeInTheDocument();
    expect(screen.getByText("Nada por aqui.")).toBeInTheDocument();
    expect(document.querySelector("svg")).not.toBeNull();
  });

  it("renders an already-instantiated icon element", () => {
    render(<EmptyState icon={<Mail size={18} />} title="Inbox vazia" />);

    expect(screen.getByText("Inbox vazia")).toBeInTheDocument();
    expect(document.querySelector("svg")).not.toBeNull();
  });
});
