# Customize a subject or degree path

Copy an existing definition under `data/`, choose a fresh stable ID, and replace its subject content. The viewer has no domain-specific constants to edit.

## Stages are configurable

A three-phase self-study plan and a multi-degree academic journey use exactly the same format. Examples:

- Undergraduate: foundation → disciplinary core → specialization → capstone.
- Master's: bridge knowledge → advanced topics → research/professional project → completion.
- Doctoral: research foundations → proposal → original work → dissertation and formal completion.
- Direct doctorate: advanced foundations and research training without a separate mandatory master's degree.
- Mixed or part-time: label stages by capability or milestone rather than a fixed year.

You may expand stages into actual semesters or years if their meaning is known. Do not infer a universal three-, four- or five-year rule. Formal deadlines and degree criteria belong to the actual program, not the viewer.

## Branches and targets

Use branches appropriate to the subject: theory, fieldwork, laboratory methods, design practice, languages, interpretation, professional communication, teaching, or whatever the target requires. A humanities, arts or professional tree need not include programming.

Choose a concrete endpoint. It may be a bachelor's project, a master's thesis, a doctoral contribution, a qualification, a portfolio, or an independently defined learning goal. Completion of a visualization is not institutional certification.

## Optional breadth with a real continuation

For a specialist branch, identify the work it can support. A method can feed a comparative analysis, measurement, proof, archive, design or other evidence. Connect that use with a dashed edge and explain the conditions. Keep alternative routes optional.

Use real hard prerequisites only when the node's defined scope requires them. Related background and broad course-inclusion relationships are not automatically prerequisites.

## View appearance

Adjust colors in `branches`. Generic layout and rendering live in `src/engine.cjs`, `src/app.js`, and `src/style.css`. Horizontal column spacing is 360 world units, with 192-unit cards; headings retain at least 14 screen pixels and grow with zoom. Rebuild generated HTML after editing source.

The current interface is Chinese. Dataset language and content are configurable; full interface translation requires changing viewer copy. Do not claim the language metadata performs translation.
