using System.Net;
using System.Text;
using System.Text.Json.Nodes;

// Static HTML is generated at build time, not at browser startup.
// Templates and history.json are the canonical sources; never edit generated index files.
var root = args.Length > 0 ? Path.GetFullPath(args[0]) : Directory.GetCurrentDirectory();
if (!File.Exists(Path.Combine(root, "GLHF.csproj")))
    throw new InvalidOperationException("Ejecuta SiteBuilder con la ruta del proyecto GLHF.");
var catalog = JsonNode.Parse(File.ReadAllText(Path.Combine(root, "Content", "history.json")))
    ?? throw new InvalidOperationException("Catálogo JSON no válido.");
var sourceMap = catalog["sources"]!.AsArray().ToDictionary(n => n!["id"]!.GetValue<string>(), n => n!);
var templates = Directory.GetFiles(Path.Combine(root, "Templates"), "*.html")
    .ToDictionary(p => Path.GetFileNameWithoutExtension(p)!, p => File.ReadAllText(p));
string H(string s) => WebUtility.HtmlEncode(s);
string Value(JsonNode n, string k) => n[k]!.GetValue<string>();
string Render(string name, Dictionary<string,string> values)
{
    var result = templates[name];
    foreach (var (key, value) in values) result = result.Replace("{{" + key + "}}", value, StringComparison.Ordinal);
    return result;
}
Dictionary<string,string> Scalars(JsonNode node) => node.AsObject()
    .Where(p => p.Value is JsonValue).ToDictionary(p => p.Key, p => H(p.Value!.ToString()));
string Refs(JsonNode item)
{
    var links = item["sources"]!.AsArray().Select(n => {
        var id = n!.GetValue<string>();
        var s = sourceMap[id];
        return "<a href=\"#source-" + H(id) + "\">" + H(Value(s, "publisher")) + "</a>";
    });
    return "<div class=\"refs\">" + string.Join("", links) + "</div>";
}
var navigation = new StringBuilder();
var timeline = new StringBuilder();
var eras = new StringBuilder();
foreach (var item in catalog["eras"]!.AsArray())
{
    var n = item!;
    var v = Scalars(n);
    v["name"] = H(Value(n, "kicker").Split(" / ", 2).Last().ToLowerInvariant());
    navigation.Append(Render("nav-item", v));
    timeline.Append(Render("timeline-item", v));
    var events = new StringBuilder();
    foreach (var e in n["events"]!.AsArray())
    {
        var ev = Scalars(e!); ev["sources"] = Refs(e!);
        events.Append(Render("event", ev));
    }
    v["events"] = events.ToString();
    v["tags"] = string.Join("", n["tags"]!.AsArray().Select(t => "<span>" + H(t!.GetValue<string>()) + "</span>"));
    eras.Append(Render("era", v));
}
var games = new StringBuilder();
var number = 0;
foreach (var item in catalog["games"]!.AsArray())
{
    var v = Scalars(item!); v["number"] = (++number).ToString("D3"); v["sources"] = Refs(item!);
    games.Append(Render("game", v));
}
var revolutions = new StringBuilder();
foreach (var item in catalog["revolutions"]!.AsArray())
{
    var v = Scalars(item!); v["sources"] = Refs(item!);
    revolutions.Append(Render("revolution", v));
}
var sources = string.Join("", catalog["sources"]!.AsArray().Select(n => Render("source", Scalars(n!))));
void Generate(string path, string basePath, string mode, string status)
{
    var values = new Dictionary<string,string> {
        ["base"] = H(basePath), ["mode"] = H(mode), ["status"] = H(status),
        ["navigation"] = navigation.ToString(), ["timeline"] = timeline.ToString(), ["eras"] = eras.ToString(),
        ["games"] = games.ToString(), ["revolutions"] = revolutions.ToString(), ["sources"] = sources
    };
    var text = Render("page", values);
    if (mode == "preview")
    {
        text = text.Replace("<base href=\"" + H(basePath) + "\" />\n", "", StringComparison.Ordinal)
            .Replace("href=\"assets/", "href=\"wwwroot/assets/", StringComparison.Ordinal)
            .Replace("src=\"assets/", "src=\"wwwroot/assets/", StringComparison.Ordinal);
    }
    if (!File.Exists(path) || File.ReadAllText(path) != text)
        File.WriteAllText(path, text, new UTF8Encoding(false));
}
Generate(Path.Combine(root,"index.html"), "./wwwroot/", "preview", "Vista previa HTML");
Generate(Path.Combine(root,"wwwroot","index.html"), "./", "blazor", "Archivo abierto");
Console.WriteLine("GLHF: HTML generado desde el catálogo. Logo original reutilizado.");
