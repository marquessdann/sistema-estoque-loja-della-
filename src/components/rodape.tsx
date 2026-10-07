// Rodapé de autoria, em todas as telas (login, escolha do estoque e telas internas)
export function Rodape({ className = '' }: { className?: string }) {
  return (
    <footer className={`px-4 py-6 text-center text-[11px] leading-relaxed text-neutral-500 ${className}`}>
      <p>
        Criado e desenvolvido por <b className="font-semibold text-neutral-400">Daniel Marques</b>
      </p>
      <p>
        © {new Date().getFullYear()} DELLA Comércio e Distribuidora de Produtos LTDA · Todos os direitos reservados.
      </p>
      <p>Uso interno e restrito à equipe DELLA.</p>
    </footer>
  );
}
