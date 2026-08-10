# REVITA

O **REVITA** é uma plataforma de rastreabilidade e gestão de órteses, próteses e outros dispositivos assistivos no SUS.

A proposta é acompanhar não apenas o paciente, mas também o **dispositivo durante todo o seu ciclo de vida**: solicitação, autorização, triagem, produção, estoque, entrega, manutenção, recall, reaproveitamento e logística reversa.

A plataforma possui três perfis principais:

* **Manager:** acompanha indicadores gerais da rede, finanças, logística, ciclo de vida, relatórios, alertas e situação dos CREs.
* **CRE:** gerencia pacientes da unidade, triagens, dispositivos, estoque, matching, atendimento e logística reversa.
* **Paciente:** acompanha a própria solicitação, recebe notificações, acessa a carteirinha digital e pode entrar em contato com o CRE responsável.

## Matching nacional

Um dos principais recursos do REVITA é o **matching de dispositivos**. Se um CRE possui uma prótese ou órtese compatível parada em estoque e outro CRE possui um paciente que precisa daquele mesmo produto, o sistema pode identificar a oportunidade de reaproveitamento.

A peça é reservada, o CRE de origem decide sobre o envio e, quando aceita, o dispositivo segue para transferência. Isso reduz desperdícios e evita novas produções quando já existe um item adequado disponível na rede.

Dispositivos danificados ou vencidos não são reutilizados clinicamente, mas podem seguir para **fundição, recuperação de materiais, aproveitamento de componentes ou descarte adequado**.

## Principais recursos

* acompanhamento completo da jornada do paciente;
* rastreabilidade individual de dispositivos;
* gestão de CREs, UBSs, profissionais e solicitações;
* integração do fluxo SISREG;
* estoque físico e produção;
* matching e transferência entre CREs;
* logística reversa e reaproveitamento;
* recalls e alertas;
* relatórios gerenciais e financeiros;
* carteirinha digital do paciente;
* suporte a Português, Inglês e Espanhol;
* layout responsivo;
* suporte a leitores de tela e navegação por teclado.

## Estrutura do projeto

```text
SiteSUS/
├── backend/
│   ├── main.py
│   └── validation.py
│
├── frontend/
│   ├── public/
│   └── src/
│       ├── components/
│       ├── hooks/
│       ├── i18n/
│       │   └── locales/
│       │       ├── pt-BR.json
│       │       ├── en-US.json
│       │       └── es-419.json
│       ├── lib/
│       ├── pages/
│       ├── types/
│       ├── App.tsx
│       └── main.tsx
│
└── README.md
```

O **frontend** concentra as interfaces de Manager, CRE e Paciente. O **backend** aplica as regras de negócio, autenticação, autorização e comunicação com o banco de dados.
