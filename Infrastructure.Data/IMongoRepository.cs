using Domain;

namespace Infrastructure.Data
{
    /// <summary>
    /// MongoDB-specific repository interface that extends the base repository with MongoDB operations
    /// </summary>
    /// <typeparam name="T">The entity type, must inherit from BaseDataObject</typeparam>
    public interface IMongoRepository<T> : IRepository<T> where T : BaseDataObject
    {
    }
}