namespace GLHF.Models;

public sealed class Archive
{
    public string Edition { get; set; } = "";
    public string ReviewDate { get; set; } = "";
    public List<Era> Eras { get; set; } = [];
}

public sealed class Era
{
    public string Id { get; set; } = "";
    public string Label { get; set; } = "";
    public string Period { get; set; } = "";
    public string Title { get; set; } = "";
    public string Kicker { get; set; } = "";
    public string Description { get; set; } = "";
}
