using System.Text.Json;
using System.Text.Json.Serialization;
using GLHF.Models;

namespace GLHF.Services;

public sealed class ArchiveCatalog
{
    public IReadOnlyList<Era> Eras { get; }

    public ArchiveCatalog()
    {
        using var stream = typeof(ArchiveCatalog).Assembly.GetManifestResourceStream("GLHF.history.json")
            ?? throw new InvalidOperationException("No se encuentra el catálogo de GLHF.");
        var archive = JsonSerializer.Deserialize(stream, ArchiveJsonContext.Default.Archive)
            ?? throw new InvalidOperationException("El catálogo de GLHF no es válido.");
        if (archive.Eras.Count == 0 || archive.Eras.Select(e => e.Id).Distinct().Count() != archive.Eras.Count)
            throw new InvalidOperationException("El catálogo debe tener eras con identificadores únicos.");
        Eras = archive.Eras.AsReadOnly();
    }
}

[JsonSourceGenerationOptions(PropertyNameCaseInsensitive = true, PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(Archive))]
internal partial class ArchiveJsonContext : JsonSerializerContext { }
